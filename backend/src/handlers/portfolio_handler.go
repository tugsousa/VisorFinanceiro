package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type PortfolioHandler struct {
	uploadService services.UploadService
	priceService  services.PriceService
}

func NewPortfolioHandler(uploadService services.UploadService, priceService services.PriceService) *PortfolioHandler {
	return &PortfolioHandler{
		uploadService: uploadService,
		priceService:  priceService,
	}
}

func (h *PortfolioHandler) HandleGetCurrentHoldingsValue(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetCurrentHoldingsValue for userID: %d", userID)

	// 1. Get current stock holdings from the existing service.
	holdings, err := h.uploadService.GetStockHoldings(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	// 2. Extract the unique ISINs from the holdings list.
	isinMap := make(map[string]bool)
	for _, holding := range holdings {
		// Only try to get prices for holdings with a valid ISIN
		if holding.ISIN != "" && !strings.HasPrefix(strings.ToLower(holding.ISIN), "unknown") {
			isinMap[holding.ISIN] = true
		}
	}
	uniqueISINs := make([]string, 0, len(isinMap))
	for isin := range isinMap {
		uniqueISINs = append(uniqueISINs, isin)
	}

	// 3. Call the new PriceService to get current prices.
	prices, err := h.priceService.GetCurrentPrices(uniqueISINs)
	if err != nil {
		// Log the error but don't fail the request, as we can still return holdings with purchase data.
		log.Printf("Warning: could not fetch some or all current prices for userID %d: %v", userID, err)
	}

	// 4. Combine the holding data with the price data for the final response.
	type HoldingWithValue struct {
		models.PurchaseLot
		CurrentPriceEUR float64 `json:"current_price_eur"`
		MarketValueEUR  float64 `json:"market_value_eur"`
		Status          string  `json:"status"`
	}

	response := []HoldingWithValue{}
	for _, holding := range holdings {
		priceInfo, found := prices[holding.ISIN]
		currentPrice := 0.0
		marketValue := 0.0
		status := "UNAVAILABLE"

		// Use the average purchase price as the default/fallback value
		if holding.Quantity > 0 {
			currentPrice = holding.BuyAmountEUR / float64(holding.Quantity)
		}
		marketValue = holding.BuyAmountEUR

		// If we found a live price, override the fallback values
		if found && priceInfo.Status == "OK" {
			status = "OK"
			currentPrice = priceInfo.Price
			marketValue = priceInfo.Price * float64(holding.Quantity)
		}

		response = append(response, HoldingWithValue{
			PurchaseLot:     holding,
			CurrentPriceEUR: currentPrice,
			MarketValueEUR:  marketValue,
			Status:          status,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *PortfolioHandler) HandleGetStockSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockSales for userID: %d", userID)
	stockSales, err := h.uploadService.GetStockSaleDetails(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock sales for userID %d: %v", userID, err), http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionSales for userID: %d", userID)
	optionSales, err := h.uploadService.GetOptionSaleDetails(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving option sales for userID %d: %v", userID, err), http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockHoldings for userID: %d", userID)
	stockHoldings, err := h.uploadService.GetStockHoldings(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionHoldings for userID: %d", userID)
	optionHoldings, err := h.uploadService.GetOptionHoldings(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving option holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if optionHoldings == nil {
		optionHoldings = []models.OptionHolding{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(optionHoldings)
}
