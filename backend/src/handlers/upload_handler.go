// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/security/validation"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils" // Import utils package
)

type UploadHandler struct {
	uploadService services.UploadService
}

func NewUploadHandler(service services.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: service,
	}
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context()) // Assumes GetUserIDFromContext is available (it's in user_handler.go)
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized) // Use utils.SendJSONError
		return
	}

	if err := r.ParseMultipartForm(config.Cfg.MaxUploadSizeBytes); err != nil {
		logger.L.Warn("Failed to parse multipart form or request too large", "userID", userID, "error", err, "limit", config.Cfg.MaxUploadSizeBytes)
		utils.SendJSONError(w, fmt.Sprintf("Failed to parse form or request too large (max %d MB)", config.Cfg.MaxUploadSizeBytes/(1024*1024)), http.StatusBadRequest) // Use utils.SendJSONError
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		logger.L.Warn("Failed to retrieve file from request", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to retrieve file from request. Ensure 'file' field is used.", http.StatusBadRequest) // Use utils.SendJSONError
		return
	}
	defer file.Close()

	if fileHeader.Size > config.Cfg.MaxUploadSizeBytes {
		logger.L.Warn("Uploaded file header reports size too large", "userID", userID, "fileSize", fileHeader.Size, "limit", config.Cfg.MaxUploadSizeBytes)
		utils.SendJSONError(w, fmt.Sprintf("File too large, max %d MB (header check)", config.Cfg.MaxUploadSizeBytes/(1024*1024)), http.StatusBadRequest) // Use utils.SendJSONError
		return
	}

	clientContentType := fileHeader.Header.Get("Content-Type")
	if err := validation.ValidateClientContentType(clientContentType); err != nil {
		logger.L.Warn("Invalid client-declared file type", "userID", userID, "contentType", clientContentType, "error", err)
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest) // Use utils.SendJSONError
		return
	}
	logger.L.Debug("Client-declared Content-Type validated", "userID", userID, "contentType", clientContentType)

	detectedContentType, err := validation.ValidateFileContentByMagicBytes(file)
	if err != nil {
		logger.L.Warn("Server-side file content validation failed", "userID", userID, "filename", fileHeader.Filename, "error", err)
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest) // Use utils.SendJSONError
		return
	}
	logger.L.Info("File content validated by magic bytes", "userID", userID, "filename", fileHeader.Filename, "clientType", clientContentType, "detectedType", detectedContentType)

	logger.L.Info("Processing upload request", "userID", userID, "filename", fileHeader.Filename)
	result, err := h.uploadService.ProcessUpload(file, userID)
	if err != nil {
		if errors.Is(err, validation.ErrValidationFailed) {
			logger.L.Warn("Upload processing failed due to data validation errors", "userID", userID, "filename", fileHeader.Filename, "error", err)
			utils.SendJSONError(w, fmt.Sprintf("File content validation failed: %v", err), http.StatusBadRequest) // Use utils.SendJSONError
		} else if errors.Is(err, services.ErrParsingFailed) {
			logger.L.Warn("Upload processing failed due to CSV parsing errors", "userID", userID, "filename", fileHeader.Filename, "error", err)
			utils.SendJSONError(w, fmt.Sprintf("Error parsing CSV file: %v", err), http.StatusBadRequest) // Use utils.SendJSONError
		} else if errors.Is(err, services.ErrProcessingFailed) {
			logger.L.Warn("Upload processing failed during transaction processing", "userID", userID, "filename", fileHeader.Filename, "error", err)
			utils.SendJSONError(w, fmt.Sprintf("Error processing transactions in file: %v", err), http.StatusBadRequest) // Use utils.SendJSONError
		} else {
			logger.L.Error("Internal error processing upload", "userID", userID, "filename", fileHeader.Filename, "error", err)
			utils.SendJSONError(w, "An internal error occurred while processing the file. Please try again later.", http.StatusInternalServerError) // Use utils.SendJSONError
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(result); err != nil {
		logger.L.Error("Error encoding JSON response for upload result", "userID", userID, "error", err)
	}
}

func (h *UploadHandler) HandleGetRealizedGainsData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context()) // Assumes GetUserIDFromContext is available
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized) // Use utils.SendJSONError
		return
	}
	logger.L.Debug("Handling GetRealizedGainsData request with ETag support", "userID", userID)

	realizedgainsData, err := h.uploadService.GetLatestUploadResult(userID)
	if err != nil {
		logger.L.Error("Error retrieving realizedgains data from service", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving realizedgains data for userID %d: %v", userID, err), http.StatusInternalServerError) // Use utils.SendJSONError
		return
	}

	if realizedgainsData.StockSaleDetails == nil {
		realizedgainsData.StockSaleDetails = []models.SaleDetail{}
	}
	// Correctly initialize StockHoldings as an empty map if it's nil
	// This prevents a null value in the JSON response if there are no holdings.
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
