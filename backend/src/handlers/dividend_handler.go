package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
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
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetDividendTaxSummary for userID: %d", userID)
	taxSummary, err := h.uploadService.GetDividendTaxSummary(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend tax summary for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if taxSummary == nil {
		taxSummary = make(models.DividendTaxResult)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(taxSummary)
}

func (h *DividendHandler) HandleGetDividendTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetDividendTransactions for userID: %d", userID)
	dividendTransactions, err := h.uploadService.GetDividendTransactions(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if dividendTransactions == nil {
		dividendTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dividendTransactions)
}
