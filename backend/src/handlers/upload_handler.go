// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/security/validation"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type UploadHandler struct {
	uploadService services.UploadService
}

func NewUploadHandler(service services.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: service,
	}
}

// logUploadFailure insere um registo de falha de upload na base de dados.
func logUploadFailure(userID int64, source, filename, errorMessage string) {
	_, err := database.DB.Exec(
		"INSERT INTO upload_failures (user_id, source, filename, error_message) VALUES (?, ?, ?, ?)",
		userID, source, filename, errorMessage,
	)
	if err != nil {
		logger.L.Error("Failed to log upload failure to database", "userID", userID, "error", err)
	}
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// Parsing multipart form first to fail fast on size
	if err := r.ParseMultipartForm(config.Cfg.MaxUploadSizeBytes); err != nil {
		errMsg := fmt.Sprintf("Error parsing file (max %d MB)", config.Cfg.MaxUploadSizeBytes/(1024*1024))
		logger.L.Warn("Failed to parse multipart form", "userID", userID, "error", err)
		go logUploadFailure(userID, r.FormValue("source"), "", err.Error())
		utils.SendJSONError(w, errMsg, http.StatusBadRequest)
		return
	}

	source := r.FormValue("source")
	portfolioIDStr := r.FormValue("portfolio_id")

	if source == "" || portfolioIDStr == "" {
		utils.SendJSONError(w, "Source and Portfolio ID are required", http.StatusBadRequest)
		return
	}

	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid Portfolio ID", http.StatusBadRequest)
		return
	}

	// Start transaction to check limits and verify ownership safely
	tx, err := database.DB.Begin()
	if err != nil {
		utils.SendJSONError(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 1. Verify Portfolio Ownership
	var pfExists int
	err = tx.QueryRow("SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?", portfolioID, userID).Scan(&pfExists)
	if err != nil {
		logger.L.Warn("Unauthorized portfolio upload attempt", "userID", userID, "pfID", portfolioID)
		utils.SendJSONError(w, "Invalid Portfolio", http.StatusForbidden)
		return
	}

	// 2. Check Upload Limit (Atomic Read)
	const uploadLimit = 10
	var currentUploadCount int
	err = tx.QueryRow("SELECT upload_count FROM users WHERE id = ?", userID).Scan(&currentUploadCount)
	if err != nil {
		utils.SendJSONError(w, "Failed to verify user limits", http.StatusInternalServerError)
		return
	}

	if currentUploadCount >= uploadLimit {
		logger.L.Warn("User reached upload limit", "userID", userID, "count", currentUploadCount)
		go logUploadFailure(userID, source, "", "Upload limit reached")
		utils.SendJSONError(w, "Upload limit reached (max 10). Please delete existing files.", http.StatusForbidden)
		return
	}

	// Commit is technically not needed here if we don't write, but good practice to close the read transaction cleanly
	tx.Commit()

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		utils.SendJSONError(w, "File not found", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// (Validate Content-Type and Magic Bytes here - existing code)
	detectedContentType, err := validation.ValidateFileContentByMagicBytes(file)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	logger.L.Debug("Content type validated", "type", detectedContentType)

	result, err := h.uploadService.ProcessUpload(file, userID, portfolioID, source, fileHeader.Filename, fileHeader.Size)
	if err != nil {
		go logUploadFailure(userID, source, fileHeader.Filename, err.Error())
		utils.SendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}

func (h *UploadHandler) HandleGetRealizedGainsData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}

	// --- MULTI-PORTFOLIO CHANGE START ---
	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		utils.SendJSONError(w, "Portfolio ID is required", http.StatusBadRequest)
		return
	}
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid Portfolio ID", http.StatusBadRequest)
		return
	}
	// --- MULTI-PORTFOLIO CHANGE END ---

	logger.L.Debug("Handling GetRealizedGainsData request with ETag support", "userID", userID, "portfolioID", portfolioID)

	realizedgainsData, err := h.uploadService.GetLatestUploadResult(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error retrieving realizedgains data from service", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving realizedgains data for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	if realizedgainsData.DividendTransactionsList != nil {
		logger.L.Info("Data prepared for response in handler", "userID", userID, "dividendListCount", len(realizedgainsData.DividendTransactionsList))
	} else {
		logger.L.Info("Data prepared for response in handler", "userID", userID, "dividendListCount", "nil")
	}

	if realizedgainsData.StockSaleDetails == nil {
		realizedgainsData.StockSaleDetails = []models.SaleDetail{}
	}
	if realizedgainsData.StockHoldings == nil {
		realizedgainsData.StockHoldings = make(map[string][]models.PurchaseLot)
	}
	if realizedgainsData.OptionSaleDetails == nil {
		realizedgainsData.OptionSaleDetails = []models.OptionSaleDetail{}
	}
	if realizedgainsData.OptionHoldings == nil {
		realizedgainsData.OptionHoldings = []models.OptionHolding{}
	}
	if realizedgainsData.CashMovements == nil {
		realizedgainsData.CashMovements = []models.CashMovement{}
	}
	if realizedgainsData.DividendTransactionsList == nil {
		realizedgainsData.DividendTransactionsList = []models.ProcessedTransaction{}
	}

	currentETag, etagErr := utils.GenerateETag(realizedgainsData)
	if etagErr != nil {
		logger.L.Error("Failed to generate ETag for realizedgains data", "userID", userID, "error", etagErr)
	}

	w.Header().Set("Cache-Control", "no-cache, private")

	if etagErr == nil && currentETag != "" {
		quotedETag := fmt.Sprintf("\"%s\"", currentETag)
		w.Header().Set("ETag", quotedETag)
		clientETag := r.Header.Get("If-None-Match")
		clientETags := strings.Split(clientETag, ",")
		for _, cETag := range clientETags {
			if strings.TrimSpace(cETag) == quotedETag {
				logger.L.Info("ETag match for realizedgains data", "userID", userID, "etag", currentETag)
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
		if clientETag != "" {
			logger.L.Debug("ETag mismatch", "userID", userID, "clientETags", clientETag, "serverETag", quotedETag)
		}
	} else {
		logger.L.Warn("Proceeding without ETag check due to ETag generation error or empty ETag", "userID", userID)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(realizedgainsData); err != nil {
		logger.L.Error("Error generating JSON response for realizedgains data", "userID", userID, "error", err)
	}
}
