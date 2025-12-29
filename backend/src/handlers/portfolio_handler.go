// backend/src/handlers/portfolio_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
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
	logger.L.Info("Handling GetCurrentHoldingsValue", "userID", userID, "portfolioID", portfolioID)

	// Simplified: Delegate entirely to the service
	holdings, err := h.uploadService.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving current holdings: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(holdings)
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

func (h *PortfolioHandler) HandleRefreshSnapshot(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Extract Portfolio ID from URL path (using Chi)
	portfolioIDStr := chi.URLParam(r, "id")
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid portfolio ID", http.StatusBadRequest)
		return
	}

	// Security check: Ensure portfolio belongs to user
	err = h.uploadService.RefreshDailySnapshot(userID, portfolioID)
	if err != nil {
		logger.L.Error("Failed to refresh snapshot", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to refresh portfolio data", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Snapshot refreshed"})
}
