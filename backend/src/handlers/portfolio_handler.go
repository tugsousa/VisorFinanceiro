// backend/src/handlers/portfolio_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/username/taxfolio/backend/src/logger"
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

// Helper to extract portfolio ID from query params
func getPortfolioID(r *http.Request) (int64, error) {
	pidStr := r.URL.Query().Get("portfolio_id")
	if pidStr == "" {
		return 0, fmt.Errorf("portfolio_id is required")
	}
	return strconv.ParseInt(pidStr, 10, 64)
}

func (h *PortfolioHandler) HandleGetCurrentHoldingsValue(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("Handling GetCurrentHoldingsValue for userID: %d, portfolioID: %d", userID, portfolioID)

	// Updated call
	holdingsByYear, err := h.uploadService.GetStockHoldings(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock holdings: %v", err), http.StatusInternalServerError)
		return
	}

	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	individualLots := holdingsByYear[latestYear]

	// Aggregation logic...
	type AggregatedHolding struct {
		ISIN              string
		ProductName       string
		TotalQuantity     int
		TotalCostBasisEUR float64
	}
	groupedHoldings := make(map[string]AggregatedHolding)
	for _, lot := range individualLots {
		if lot.ISIN == "" {
			continue
		}
		agg, exists := groupedHoldings[lot.ISIN]
		if !exists {
			agg = AggregatedHolding{ISIN: lot.ISIN, ProductName: lot.ProductName}
		}
		agg.TotalQuantity += lot.Quantity
		agg.TotalCostBasisEUR += lot.BuyAmountEUR
		groupedHoldings[lot.ISIN] = agg
	}

	uniqueISINs := make([]string, 0, len(groupedHoldings))
	for isin := range groupedHoldings {
		if !strings.HasPrefix(strings.ToLower(isin), "unknown") {
			uniqueISINs = append(uniqueISINs, isin)
		}
	}

	prices, err := h.priceService.GetCurrentPrices(uniqueISINs)
	if err != nil {
		log.Printf("Warning: could not fetch prices: %v", err)
	}

	response := []models.HoldingWithValue{}
	for isin, holding := range groupedHoldings {
		priceInfo, found := prices[isin]
		currentPrice := 0.0
		marketValue := math.Abs(holding.TotalCostBasisEUR)
		status := "UNAVAILABLE"

		if found && priceInfo.Status == "OK" {
			status = "OK"
			currentPrice = priceInfo.Price
			marketValue = priceInfo.Price * float64(holding.TotalQuantity)
		}

		response = append(response, models.HoldingWithValue{
			ISIN:              holding.ISIN,
			ProductName:       holding.ProductName,
			Quantity:          holding.TotalQuantity,
			TotalCostBasisEUR: math.Abs(holding.TotalCostBasisEUR),
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
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	stockSales, err := h.uploadService.GetStockSaleDetails(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock sales: %v", err), http.StatusInternalServerError)
		return
	}
	if stockSales == nil {
		stockSales = []models.SaleDetail{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stockSales)
}

func (h *PortfolioHandler) HandleGetHistoricalChartData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	data, err := h.uploadService.GetHistoricalChartData(userID, portfolioID)
	if err != nil {
		logger.L.Error("Failed to get historical chart data", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to retrieve chart data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (h *PortfolioHandler) HandleGetOptionSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	optionSales, err := h.uploadService.GetOptionSaleDetails(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving option sales: %v", err), http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	stockHoldings, err := h.uploadService.GetStockHoldings(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving stock holdings: %v", err), http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	optionHoldings, err := h.uploadService.GetOptionHoldings(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving option holdings: %v", err), http.StatusInternalServerError)
		return
	}
	if optionHoldings == nil {
		optionHoldings = []models.OptionHolding{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(optionHoldings)
}
