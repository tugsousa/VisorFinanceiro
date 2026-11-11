package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

// maxAllocationBody limits the JSON body of the allocation writes.
const maxAllocationBody = 1 << 20

// allocationRequest reads the user and the portfolio of an allocation request, answering the request
// itself when either is missing.
func allocationRequest(w http.ResponseWriter, r *http.Request) (int64, int64, bool) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return 0, 0, false
	}
	portfolioID, err := getPortfolioID(r)
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return 0, 0, false
	}
	return userID, portfolioID, true
}

// sendAllocationError answers with 400 for invalid input, 404 for a portfolio of someone else, and
// 500 for anything else.
func sendAllocationError(w http.ResponseWriter, action string, err error) {
	switch {
	case errors.Is(err, services.ErrAllocationInput):
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrAllocationPortfolioNotFound):
		utils.SendJSONError(w, "portfolio not found", http.StatusNotFound)
	default:
		utils.SendJSONError(w, fmt.Sprintf("Error %s: %v", action, err), http.StatusInternalServerError)
	}
}

func decodeAllocationBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxAllocationBody)
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		utils.SendJSONError(w, "invalid request body", http.StatusBadRequest)
		return false
	}
	return true
}

func sendAllocationJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}

// HandleGetAllocation answers GET /api/allocation?portfolio_id=: the groups, the assignments and how
// far each group is from its target.
func (h *PortfolioHandler) HandleGetAllocation(w http.ResponseWriter, r *http.Request) {
	userID, portfolioID, ok := allocationRequest(w, r)
	if !ok {
		return
	}
	status, err := h.uploadService.GetAllocation(userID, portfolioID)
	if err != nil {
		sendAllocationError(w, "retrieving the allocation", err)
		return
	}
	sendAllocationJSON(w, status)
}

// HandleSaveAllocationGroups answers PUT /api/allocation/groups?portfolio_id= with
// {"groups": [...]}, which replaces all the groups.
func (h *PortfolioHandler) HandleSaveAllocationGroups(w http.ResponseWriter, r *http.Request) {
	userID, portfolioID, ok := allocationRequest(w, r)
	if !ok {
		return
	}
	var body struct {
		Groups []services.AllocationGroup `json:"groups"`
	}
	if !decodeAllocationBody(w, r, &body) {
		return
	}
	groups, err := h.uploadService.SaveAllocationGroups(userID, portfolioID, body.Groups)
	if err != nil {
		sendAllocationError(w, "saving the groups", err)
		return
	}
	sendAllocationJSON(w, map[string]any{"groups": groups})
}

// HandleSaveAllocationAssignments answers PUT /api/allocation/assignments?portfolio_id= with
// {"assignments": [...]}, which replaces all the assignments.
func (h *PortfolioHandler) HandleSaveAllocationAssignments(w http.ResponseWriter, r *http.Request) {
	userID, portfolioID, ok := allocationRequest(w, r)
	if !ok {
		return
	}
	var body struct {
		Assignments []services.AllocationAssignment `json:"assignments"`
	}
	if !decodeAllocationBody(w, r, &body) {
		return
	}
	if err := h.uploadService.SaveAllocationAssignments(userID, portfolioID, body.Assignments); err != nil {
		sendAllocationError(w, "saving the assignments", err)
		return
	}
	sendAllocationJSON(w, map[string]string{"status": "ok"})
}

// HandleSaveAllocationSettings answers PUT /api/allocation/settings?portfolio_id= with {"tolerance_pp": 5}.
func (h *PortfolioHandler) HandleSaveAllocationSettings(w http.ResponseWriter, r *http.Request) {
	userID, portfolioID, ok := allocationRequest(w, r)
	if !ok {
		return
	}
	var settings services.AllocationSettings
	if !decodeAllocationBody(w, r, &settings) {
		return
	}
	if err := h.uploadService.SaveAllocationSettings(userID, portfolioID, settings); err != nil {
		sendAllocationError(w, "saving the settings", err)
		return
	}
	sendAllocationJSON(w, settings)
}

// HandleAllocationDepositPlan answers GET /api/allocation/deposit-plan?portfolio_id=&amount=. It's a
// GET because it only reads: nothing is stored.
func (h *PortfolioHandler) HandleAllocationDepositPlan(w http.ResponseWriter, r *http.Request) {
	userID, portfolioID, ok := allocationRequest(w, r)
	if !ok {
		return
	}
	amount, err := parseOptionalFloat(r, "amount")
	if err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	plan, err := h.uploadService.PlanAllocationDeposit(userID, portfolioID, amount)
	if err != nil {
		sendAllocationError(w, "planning the deposit", err)
		return
	}
	sendAllocationJSON(w, plan)
}
