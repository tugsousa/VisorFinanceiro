package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type DividendHandler struct {
	uploadService services.UploadService
}

func NewDividendHandler(service services.UploadService) *DividendHandler {
	return &DividendHandler{uploadService: service}
}

func (h *DividendHandler) HandleGetDividendTaxSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// Extract Portfolio ID
	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		utils.SendJSONError(w, "portfolio_id required", http.StatusBadRequest)
		return
	}
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid portfolio_id", http.StatusBadRequest)
		return
	}

	logger.L.Info("Handling GetDividendTaxSummary", "userID", userID, "portfolioID", portfolioID)

	taxSummary, err := h.uploadService.GetDividendTaxSummary(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error retrieving dividend tax summary", "error", err)
		utils.SendJSONError(w, "Error retrieving summary", http.StatusInternalServerError)
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
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		utils.SendJSONError(w, "portfolio_id required", http.StatusBadRequest)
		return
	}
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid portfolio_id", http.StatusBadRequest)
		return
	}

	logger.L.Info("Handling GetDividendTransactions", "userID", userID, "portfolioID", portfolioID)

	dividendTransactions, err := h.uploadService.GetDividendTransactions(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error retrieving dividend transactions", "error", err)
		utils.SendJSONError(w, "Error retrieving transactions", http.StatusInternalServerError)
		return
	}
	if dividendTransactions == nil {
		dividendTransactions = []models.ProcessedTransaction{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dividendTransactions)
}

func (h *DividendHandler) HandleGetDividendMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// Extract Portfolio ID
	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		utils.SendJSONError(w, "portfolio_id required", http.StatusBadRequest)
		return
	}
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid portfolio_id", http.StatusBadRequest)
		return
	}

	logger.L.Info("Handling GetDividendMetrics", "userID", userID, "portfolioID", portfolioID)

	metrics, err := h.uploadService.GetDividendMetrics(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error retrieving dividend metrics", "error", err)
		utils.SendJSONError(w, "Error retrieving metrics", http.StatusInternalServerError)
		return
	}

	if metrics == nil {
		metrics = &models.DividendMetricsResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}
