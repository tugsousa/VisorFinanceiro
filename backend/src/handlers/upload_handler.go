// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings" // For If-None-Match parsing

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
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

// HandleUpload receives the file, passes it to the service, and returns the result
// of processing *that specific file*.
func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB max file size
		logger.L.Warn("Failed to parse multipart form", "userID", userID, "error", err)
		sendJSONError(w, fmt.Sprintf("failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		logger.L.Warn("Failed to retrieve file from request", "userID", userID, "error", err)
		sendJSONError(w, fmt.Sprintf("failed to retrieve file from request: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	if fileHeader.Header.Get("Content-Type") != "text/csv" { // Basic validation
		logger.L.Warn("Invalid file type uploaded", "userID", userID, "contentType", fileHeader.Header.Get("Content-Type"))
		sendJSONError(w, "only CSV files are allowed", http.StatusBadRequest)
		return
	}
	if fileHeader.Size > 10<<20 { // Check against 10MB again
		logger.L.Warn("Uploaded file too large", "userID", userID, "fileSize", fileHeader.Size)
		sendJSONError(w, "file too large, max 10MB", http.StatusBadRequest) // User friendly max size
		return
	}

	logger.L.Info("Handling upload", "userID", userID, "filename", fileHeader.Filename)
	// ProcessUpload might still return an UploadResult containing DividendTaxResult for the batch.
	// This is specific to the /upload endpoint's immediate response.
	result, err := h.uploadService.ProcessUpload(file, userID)
	if err != nil {
		logger.L.Error("Error processing upload", "userID", userID, "filename", fileHeader.Filename, "error", err)
		sendJSONError(w, fmt.Sprintf("Error processing upload: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		logger.L.Error("Error generating JSON response for upload result", "userID", userID, "error", err)
		// Avoid http.Error after header has been written
	}
}

// HandleGetRealizedGainsData retrieves all relevant summary data for the realizedgains.
// This version includes ETag support and no longer explicitly includes DividendTaxResult in its response structure
// if the underlying service method omits it and the struct has omitempty.
func (h *UploadHandler) HandleGetRealizedGainsData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	logger.L.Debug("Handling GetRealizedGainsData request with ETag support", "userID", userID)

	// GetLatestUploadResult now returns an UploadResult where DividendTaxResult field is nil (or not populated).
	// If the UploadResult struct has `json:",omitempty"` for DividendTaxResult, it will be excluded from the JSON.
	realizedgainsData, err := h.uploadService.GetLatestUploadResult(userID)
	if err != nil {
		logger.L.Error("Error retrieving realizedgains data from service", "userID", userID, "error", err)
		sendJSONError(w, fmt.Sprintf("Error retrieving realizedgains data for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	// Ensure nil slices/maps are returned as empty ones for JSON consistency and ETag stability
	// REMOVE DividendTaxResult handling here as it's no longer expected from GetLatestUploadResult for this endpoint.
	// if realizedgainsData.DividendTaxResult == nil { // THIS BLOCK IS REMOVED
	// 	realizedgainsData.DividendTaxResult = make(models.DividendTaxResult)
	// }
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

	// Generate ETag for the current data
	currentETag, etagErr := utils.GenerateETag(realizedgainsData)
	if etagErr != nil {
		logger.L.Error("Failed to generate ETag for realizedgains data", "userID", userID, "error", etagErr)
		// Proceed without ETag matching, just send the data
	}

	// Set Cache-Control header. "no-cache" means client must revalidate.
	// "private" indicates it's user-specific and shouldn't be stored by shared caches.
	w.Header().Set("Cache-Control", "no-cache, private")

	if etagErr == nil && currentETag != "" {
		// Set the ETag header for the current response. ETag value MUST be enclosed in quotes.
		quotedETag := fmt.Sprintf("\"%s\"", currentETag)
		w.Header().Set("ETag", quotedETag)

		// Check If-None-Match request header
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

	// If no ETag match or ETag couldn't be processed, send the full response
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(realizedgainsData); err != nil {
		logger.L.Error("Error generating JSON response for realizedgains data", "userID", userID, "error", err)
		// Avoid http.Error if headers already written
	}
}

// Helper function to send JSON errors
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
