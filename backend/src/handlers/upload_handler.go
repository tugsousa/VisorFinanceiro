// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/models" // Still needed for UploadResult elements in HandleGetRealizedGainsData
	"github.com/username/taxfolio/backend/src/services"
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
		sendJSONError(w, fmt.Sprintf("failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		sendJSONError(w, fmt.Sprintf("failed to retrieve file from request: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	if fileHeader.Header.Get("Content-Type") != "text/csv" { // Basic validation
		sendJSONError(w, "only CSV files are allowed", http.StatusBadRequest)
		return
	}
	if fileHeader.Size > 10<<20 {
		sendJSONError(w, "file too large", http.StatusBadRequest)
		return
	}

	log.Printf("Handling upload for userID: %d, filename: %s", userID, fileHeader.Filename)
	result, err := h.uploadService.ProcessUpload(file, userID)
	if err != nil {
		log.Printf("Error processing upload for userID %d: %v", userID, err)
		sendJSONError(w, fmt.Sprintf("Error processing upload: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("Error generating JSON response for upload result userID %d: %v", userID, err)
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

// HandleGetRealizedGainsData retrieves all relevant summary data for the realizedgains.
func (h *UploadHandler) HandleGetRealizedGainsData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetRealizedGainsData for userID: %d", userID)

	realizedgainsData, err := h.uploadService.GetLatestUploadResult(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving realizedgains data for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	// Ensure nil slices/maps are returned as empty ones for JSON consistency
	if realizedgainsData.DividendTaxResult == nil {
		realizedgainsData.DividendTaxResult = make(models.DividendTaxResult)
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
	// if realizedgainsData.CashMovements == nil { // If you decide to include it
	//     realizedgainsData.CashMovements = []models.CashMovement{}
	// }

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(realizedgainsData); err != nil {
		log.Printf("Error generating JSON response for realizedgains data userID %d: %v", userID, err)
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

// sendJSONError is already defined in upload_handler and can be used by other new handlers
// If it's to be shared, it could be moved to a handlers/utils.go or similar.
// For now, new handlers will define their own or we can duplicate it.
// To keep it simple for this refactor, I'll duplicate it in new handlers where needed.
// However, a better long-term solution is a shared helper.
// Let's assume for now that GetUserIDFromContext is also accessible or duplicated.
// These are in the `handlers` package, so they are accessible.
// Helper function to send JSON errors
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	log.Printf("Sending JSON error to client: %s (status: %d)", message, statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
