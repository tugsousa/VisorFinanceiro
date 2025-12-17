package handlers

import (
	"encoding/json"
	"net/http"
	"strconv" // Usado para converter int para string

	"github.com/go-chi/chi/v5"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

type PortfolioManagerHandler struct{}

func NewPortfolioManagerHandler() *PortfolioManagerHandler {
	return &PortfolioManagerHandler{}
}

const MaxPortfoliosPerUser = 5 // Limite de portfólios por utilizador

func (h *PortfolioManagerHandler) ListPortfolios(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	rows, err := database.DB.Query("SELECT id, user_id, name, description, is_default, created_at FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, name ASC", userID)
	if err != nil {
		logger.L.Error("Failed to list portfolios", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to retrieve portfolios", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var portfolios []models.Portfolio
	for rows.Next() {
		var p models.Portfolio
		// Note: created_at might be string or time depending on driver, assuming compatible scan
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.IsDefault, &p.CreatedAt); err != nil {
			logger.L.Error("Row scan error", "error", err)
			continue
		}
		portfolios = append(portfolios, p)
	}
	if portfolios == nil {
		portfolios = []models.Portfolio{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(portfolios)
}

func (h *PortfolioManagerHandler) CreatePortfolio(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendJSONError(w, "Invalid body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		utils.SendJSONError(w, "Portfolio name is required", http.StatusBadRequest)
		return
	}

	// --- VERIFICAÇÃO DO LIMITE DE PORTFÓLIOS (CORRIGIDA) ---
	var currentCount int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM portfolios WHERE user_id = ?", userID).Scan(&currentCount)
	if err != nil {
		logger.L.Error("Failed to count existing portfolios", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to check portfolio limit", http.StatusInternalServerError)
		return
	}

	if currentCount >= MaxPortfoliosPerUser {
		// CORREÇÃO: Usar strconv.Itoa() para converter int para string de forma correta
		limitStr := strconv.Itoa(MaxPortfoliosPerUser)
		errMsg := "Atingiu o limite máximo de portfólios (" + limitStr + ")."
		logger.L.Warn(errMsg, "userID", userID, "currentCount", currentCount)
		utils.SendJSONError(w, errMsg, http.StatusForbidden) // Retorna 403 Forbidden
		return
	}
	// --- FIM DA VERIFICAÇÃO ---

	res, err := database.DB.Exec("INSERT INTO portfolios (user_id, name, description) VALUES (?, ?, ?)", userID, req.Name, req.Description)
	if err != nil {
		logger.L.Error("Failed to create portfolio", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to create portfolio (Name must be unique)", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "message": "Portfolio created"})
}

func (h *PortfolioManagerHandler) DeletePortfolio(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	portfolioID := chi.URLParam(r, "id")
	// Check if Default
	var isDefault bool
	err := database.DB.QueryRow("SELECT is_default FROM portfolios WHERE id = ? AND user_id = ?", portfolioID, userID).Scan(&isDefault)
	if err != nil {
		utils.SendJSONError(w, "Portfolio not found", http.StatusNotFound)
		return
	}
	if isDefault {
		utils.SendJSONError(w, "Cannot delete the default portfolio", http.StatusBadRequest)
		return
	}
	// Begin Transaction
	tx, err := database.DB.Begin()
	if err != nil {
		utils.SendJSONError(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	// Explicitly delete children (Safety measure)
	_, _ = tx.Exec("DELETE FROM processed_transactions WHERE portfolio_id = ?", portfolioID)
	_, _ = tx.Exec("DELETE FROM portfolio_snapshots WHERE portfolio_id = ?", portfolioID)
	_, _ = tx.Exec("DELETE FROM uploads_history WHERE portfolio_id = ?", portfolioID)
	// Delete Portfolio
	_, err = tx.Exec("DELETE FROM portfolios WHERE id = ? AND user_id = ?", portfolioID, userID)
	if err != nil {
		utils.SendJSONError(w, "Failed to delete portfolio", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.SendJSONError(w, "Commit failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
