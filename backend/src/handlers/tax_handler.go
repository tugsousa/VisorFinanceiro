package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

// parseOptionalFloat reads a number from the query, accepting a comma as the decimal separator.
// An empty value is 0.
func parseOptionalFloat(r *http.Request, name string) (float64, error) {
	text := strings.TrimSpace(r.URL.Query().Get(name))
	if text == "" {
		return 0, nil
	}
	value, err := strconv.ParseFloat(strings.Replace(text, ",", ".", 1), 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", name)
	}
	return value, nil
}

// HandleSimulateSale answers GET /api/tax/simulate-sale?portfolio_id=&isin=&quantity=&price=&commission=.
// It's a GET because it only reads: nothing is stored.
func (h *PortfolioHandler) HandleSimulateSale(w http.ResponseWriter, r *http.Request) {
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

	req := services.SaleSimulationRequest{ISIN: strings.TrimSpace(r.URL.Query().Get("isin"))}
	for name, target := range map[string]*float64{"quantity": &req.Quantity, "price": &req.PriceEUR, "commission": &req.Commission} {
		if *target, err = parseOptionalFloat(r, name); err != nil {
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	result, err := h.uploadService.SimulateStockSale(userID, portfolioID, req)
	if err != nil {
		if errors.Is(err, services.ErrSimulationInput) {
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		utils.SendJSONError(w, fmt.Sprintf("Error simulating the sale: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleGetTaxYearStatus answers GET /api/tax/year-status?portfolio_id=.
func (h *PortfolioHandler) HandleGetTaxYearStatus(w http.ResponseWriter, r *http.Request) {
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
	status, err := h.uploadService.GetTaxYearStatus(userID, portfolioID)
	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving the tax status: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
