// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings" // For If-None-Match parsing

	"github.com/username/taxfolio/backend/src/config" // For Cfg.MaxUploadSizeBytes
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"              // For file validation functions
	"github.com/username/taxfolio/backend/src/security/validation" // For validation.ErrValidationFailed
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils" // For GenerateETag
)

// UploadHandler struct and NewUploadHandler constructor remain the same.
type UploadHandler struct {
	uploadService services.UploadService
}

func NewUploadHandler(service services.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: service,
	}
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}

	// 1. Parse Multipart Form (includes overall request size limit)
	if err := r.ParseMultipartForm(config.Cfg.MaxUploadSizeBytes); err != nil {
		logger.L.Warn("Failed to parse multipart form or request too large", "userID", userID, "error", err, "limit", config.Cfg.MaxUploadSizeBytes)
		sendJSONError(w, fmt.Sprintf("Failed to parse form or request too large (max %d MB)", config.Cfg.MaxUploadSizeBytes/(1024*1024)), http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		logger.L.Warn("Failed to retrieve file from request", "userID", userID, "error", err)
		sendJSONError(w, "Failed to retrieve file from request. Ensure 'file' field is used.", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 2. File Header Size Check
	if fileHeader.Size > config.Cfg.MaxUploadSizeBytes {
		logger.L.Warn("Uploaded file header reports size too large", "userID", userID, "fileSize", fileHeader.Size, "limit", config.Cfg.MaxUploadSizeBytes)
		sendJSONError(w, fmt.Sprintf("File too large, max %d MB (header check)", config.Cfg.MaxUploadSizeBytes/(1024*1024)), http.StatusBadRequest)
		return
	}

	// 3. Client-Declared Content-Type Validation
	clientContentType := fileHeader.Header.Get("Content-Type")
	if err := validation.ValidateClientContentType(clientContentType); err != nil { // USING security.ValidateClientContentType
		logger.L.Warn("Invalid client-declared file type", "userID", userID, "contentType", clientContentType, "error", err)
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	logger.L.Debug("Client-declared Content-Type validated", "userID", userID, "contentType", clientContentType)

	// 4. Server-Side File Content Validation (Magic Bytes / MIME type detection)
	detectedContentType, err := validation.ValidateFileContentByMagicBytes(file) // USING security.ValidateFileContentByMagicBytes
	if err != nil {
		logger.L.Warn("Server-side file content validation failed", "userID", userID, "filename", fileHeader.Filename, "error", err)
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	logger.L.Info("File content validated by magic bytes", "userID", userID, "filename", fileHeader.Filename, "clientType", clientContentType, "detectedType", detectedContentType)

	// --- File reader's pointer is reset by ValidateFileContentByMagicBytes ---

	logger.L.Info("Processing upload request", "userID", userID, "filename", fileHeader.Filename)
	result, err := h.uploadService.ProcessUpload(file, userID)
	if err != nil {
		// Check for specific error types
		if errors.Is(err, validation.ErrValidationFailed) {
			logger.L.Warn("Upload processing failed due to data validation errors", "userID", userID, "filename", fileHeader.Filename, "error", err)
			sendJSONError(w, fmt.Sprintf("File content validation failed: %v", err), http.StatusBadRequest)
		} else if errors.Is(err, services.ErrParsingFailed) { // CHECKING services.ErrParsingFailed
			logger.L.Warn("Upload processing failed due to CSV parsing errors", "userID", userID, "filename", fileHeader.Filename, "error", err)
			sendJSONError(w, fmt.Sprintf("Error parsing CSV file: %v", err), http.StatusBadRequest)
		} else if errors.Is(err, services.ErrProcessingFailed) { // Assuming you might add this too
			logger.L.Warn("Upload processing failed during transaction processing", "userID", userID, "filename", fileHeader.Filename, "error", err)
			sendJSONError(w, fmt.Sprintf("Error processing transactions in file: %v", err), http.StatusBadRequest)
		} else {
			logger.L.Error("Internal error processing upload", "userID", userID, "filename", fileHeader.Filename, "error", err)
			sendJSONError(w, "An internal error occurred while processing the file. Please try again later.", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(result); err != nil {
		logger.L.Error("Error encoding JSON response for upload result", "userID", userID, "error", err)
	}
}

// HandleGetRealizedGainsData and sendJSONError remain the same as previously provided
// (No changes needed to these specific functions from the last full response)

func (h *UploadHandler) HandleGetRealizedGainsData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	logger.L.Debug("Handling GetRealizedGainsData request with ETag support", "userID", userID)

	realizedgainsData, err := h.uploadService.GetLatestUploadResult(userID)
	if err != nil {
		logger.L.Error("Error retrieving realizedgains data from service", "userID", userID, "error", err)
		sendJSONError(w, fmt.Sprintf("Error retrieving realizedgains data for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	if realizedgainsData.StockSaleDetails == nil {
		realizedgainsData.StockSaleDetails = []models.SaleDetail{}
	}
	if realizedgainsData.StockHoldings == nil {
		realizedgainsData.StockHoldings = []models.PurchaseLot{}
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

// Helper function to send JSON errors
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode) // Log the actual error
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
