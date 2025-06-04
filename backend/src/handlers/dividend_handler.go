// backend/src/handlers/dividend_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/username/taxfolio/backend/src/logger" // Using slog
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils" // Import utils package
)

type DividendHandler struct {
	uploadService services.UploadService
}

func NewDividendHandler(service services.UploadService) *DividendHandler {
	return &DividendHandler{
		uploadService: service,
	}
}

func (h *DividendHandler) HandleGetDividendTaxSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context()) // Assumes GetUserIDFromContext is available
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized) // Use utils.SendJSONError
		return
	}
	logger.L.Info("Handling GetDividendTaxSummary", "userID", userID)
	taxSummary, err := h.uploadService.GetDividendTaxSummary(userID)
	if err != nil {
		logger.L.Error("Error retrieving dividend tax summary", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving dividend tax summary for userID %d: %v", userID, err), http.StatusInternalServerError) // Use utils.SendJSONError
		return
	}
	if taxSummary == nil {
		taxSummary = make(models.DividendTaxResult)
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(taxSummary); err != nil {
		logger.L.Error("Error encoding dividend tax summary to JSON", "userID", userID, "error", err)
	}
}

func (h *DividendHandler) HandleGetDividendTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context()) // Assumes GetUserIDFromContext is available
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized) // Use utils.SendJSONError
		return
	}
	logger.L.Info("Handling GetDividendTransactions", "userID", userID)
	dividendTransactions, err := h.uploadService.GetDividendTransactions(userID)
	if err != nil {
		logger.L.Error("Error retrieving dividend transactions", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving dividend transactions for userID %d: %v", userID, err), http.StatusInternalServerError) // Use utils.SendJSONError
		return
	}
	if dividendTransactions == nil {
		dividendTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(dividendTransactions); err != nil {
		logger.L.Error("Error encoding dividend transactions to JSON", "userID", userID, "error", err)
	}
}
