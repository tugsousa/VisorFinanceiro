package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type FeeHandler struct {
	uploadService services.UploadService
}

func NewFeeHandler(service services.UploadService) *FeeHandler {
	return &FeeHandler{uploadService: service}
}

func (h *FeeHandler) HandleGetFeeDetails(w http.ResponseWriter, r *http.Request) {
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

	logger.L.Info("Handling GetFeeDetails request", "userID", userID, "portfolioID", portfolioID)

	feeDetails, err := h.uploadService.GetFeeDetails(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error retrieving fee details", "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving fee details: %v", err), http.StatusInternalServerError)
		return
	}

	if feeDetails == nil {
		feeDetails = []models.FeeDetail{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(feeDetails)
}
