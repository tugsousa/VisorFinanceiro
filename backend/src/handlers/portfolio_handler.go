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

// Helper struct for aggregating purchase lots by ISIN
type AggregatedHolding struct {
	ISIN              string
	ProductName       string
	TotalQuantity     int
	TotalCostBasisEUR float64
}

// Final response struct that the frontend will receive
type HoldingWithValue struct {
	ISIN              string  `json:"isin"`
	ProductName       string  `json:"product_name"`
	Quantity          int     `json:"quantity"`
	TotalCostBasisEUR float64 `json:"total_cost_basis_eur"`
	CurrentPriceEUR   float64 `json:"current_price_eur"`
	MarketValueEUR    float64 `json:"market_value_eur"`
	Status            string  `json:"status"`
}

func (h *PortfolioHandler) HandleGetCurrentHoldingsValue(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetCurrentHoldingsValue for userID: %d", userID)

	// 1. Get all individual purchase lots.
	holdingsByYear, err := h.uploadService.GetStockHoldings(userID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	individualLots := holdingsByYear[latestYear]

	// 2. Aggregate these lots by ISIN.
	groupedHoldings := make(map[string]AggregatedHolding)
	for _, lot := range individualLots {
		if lot.ISIN == "" {
			continue // Skip lots without an ISIN
		}

		agg, exists := groupedHoldings[lot.ISIN]
		if !exists {
			agg = AggregatedHolding{
				ISIN:        lot.ISIN,
				ProductName: lot.ProductName, // Use the name from the first lot encountered
			}
		}
		agg.TotalQuantity += lot.Quantity
		agg.TotalCostBasisEUR += lot.BuyAmountEUR

		groupedHoldings[lot.ISIN] = agg
	}

	// 3. Extract unique ISINs from the aggregated map.
	uniqueISINs := make([]string, 0, len(groupedHoldings))
	for isin := range groupedHoldings {
		if !strings.HasPrefix(strings.ToLower(isin), "unknown") {
			uniqueISINs = append(uniqueISINs, isin)
		}
	}

	// 4. Call the PriceService to get current prices for the unique ISINs.
	prices, err := h.priceService.GetCurrentPrices(uniqueISINs)
	if err != nil {
		// Log the error but don't fail the request. We can still return holdings with purchase data.
		log.Printf("Warning: could not fetch some or all current prices for userID %d: %v", userID, err)
	}

	// 5. Combine the aggregated holding data with the price data for the final response.
	response := []HoldingWithValue{}
	for isin, holding := range groupedHoldings {
		priceInfo, found := prices[isin]

		currentPrice := 0.0
		marketValue := holding.TotalCostBasisEUR // Default to cost basis
		status := "UNAVAILABLE"

		// If we found a live price, override the fallback values
		if found && priceInfo.Status == "OK" {
			status = "OK"
			currentPrice = priceInfo.Price
			marketValue = priceInfo.Price * float64(holding.TotalQuantity) // The correct calculation
		}

		response = append(response, HoldingWithValue{
			ISIN:              holding.ISIN,
			ProductName:       holding.ProductName,
			Quantity:          holding.TotalQuantity,
			TotalCostBasisEUR: holding.TotalCostBasisEUR,
			CurrentPriceEUR:   currentPrice,
			MarketValueEUR:    marketValue,
			Status:            status,
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
		stockHoldings = make(map[string][]models.PurchaseLot)
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
