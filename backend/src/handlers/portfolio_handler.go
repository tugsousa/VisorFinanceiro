package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
)

type PortfolioHandler struct {
	uploadService services.UploadService
}

func NewPortfolioHandler(service services.UploadService) *PortfolioHandler {
	return &PortfolioHandler{
		uploadService: service,
	}
}

func (h *PortfolioHandler) HandleGetStockSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockSales for userID: %d", userID)
	stockSales, err := h.uploadService.GetStockSaleDetails(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving stock sales for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if stockSales == nil {
		stockSales = []models.SaleDetail{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stockSales)
}

func (h *PortfolioHandler) HandleGetOptionSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionSales for userID: %d", userID)
	optionSales, err := h.uploadService.GetOptionSaleDetails(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving option sales for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	response := map[string]interface{}{"OptionSaleDetails": optionSales}
	if optionSales == nil {
		response["OptionSaleDetails"] = []models.OptionSaleDetail{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *PortfolioHandler) HandleGetStockHoldings(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockHoldings for userID: %d", userID)
	stockHoldings, err := h.uploadService.GetStockHoldings(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving stock holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if stockHoldings == nil {
		stockHoldings = []models.PurchaseLot{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stockHoldings)
}

func (h *PortfolioHandler) HandleGetOptionHoldings(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionHoldings for userID: %d", userID)
	optionHoldings, err := h.uploadService.GetOptionHoldings(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving option holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if optionHoldings == nil {
		optionHoldings = []models.OptionHolding{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(optionHoldings)
}
