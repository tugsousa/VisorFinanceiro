package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/utils"
)

// HandleGetDividendCalendar answers GET /api/dividends/calendar?portfolio_id=: the dividends of the
// positions held, the last 3 months and the next 12.
func (h *DividendHandler) HandleGetDividendCalendar(w http.ResponseWriter, r *http.Request) {
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

	var exists int
	err = database.DB.QueryRow("SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?", portfolioID, userID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		utils.SendJSONError(w, "portfolio not found", http.StatusNotFound)
		return
	}
	if err != nil {
		utils.SendJSONError(w, "Error reading the portfolio", http.StatusInternalServerError)
		return
	}

	calendar, err := h.uploadService.GetDividendCalendar(userID, portfolioID)
	if err != nil {
		logger.L.Error("Error building the dividend calendar", "userID", userID, "portfolioID", portfolioID, "error", err)
		utils.SendJSONError(w, "Error building the dividend calendar", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calendar)
}
