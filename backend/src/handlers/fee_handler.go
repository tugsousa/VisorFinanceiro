// backend/src/handlers/fee_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

// FeeHandler holds the services needed to handle fee-related requests.
type FeeHandler struct {
	uploadService services.UploadService
}

// NewFeeHandler creates a new instance of FeeHandler.
func NewFeeHandler(service services.UploadService) *FeeHandler {
	return &FeeHandler{
		uploadService: service,
	}
}

// HandleGetFeeDetails retrieves all fee and commission details for the authenticated user.
func (h *FeeHandler) HandleGetFeeDetails(w http.ResponseWriter, r *http.Request) {
	// Get the authenticated user's ID from the request context.
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	logger.L.Info("Handling GetFeeDetails request", "userID", userID)

	// Call the service layer to get the fee details.
	// NOTE: You will need to add a `GetFeeDetails` method to your UploadService interface and implementation.
	feeDetails, err := h.uploadService.GetFeeDetails(userID)
	if err != nil {
		logger.L.Error("Error retrieving fee details from service", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error retrieving fee details: %v", err), http.StatusInternalServerError)
		return
	}

	// Ensure the response is an empty array `[]` instead of `null` if no fees are found.
	if feeDetails == nil {
		feeDetails = []models.FeeDetail{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(feeDetails); err != nil {
		logger.L.Error("Error encoding fee details to JSON", "userID", userID, "error", err)
	}
}
