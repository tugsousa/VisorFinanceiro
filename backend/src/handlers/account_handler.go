package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
)

type DeleteAccountRequest struct {
	Password string `json:"password"`
}

func (h *UserHandler) DeleteAccountHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	var req DeleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByID(database.DB, userID)
	if err != nil {
		logger.L.Error("Failed to get user for account deletion", "userID", userID, "error", err)
		sendJSONError(w, "Failed to retrieve user information", http.StatusInternalServerError)
		return
	}

	// CORREÇÃO: Apenas verificar a password para contas locais
	if user.AuthProvider == "local" {
		if err := user.CheckPassword(req.Password); err != nil {
			logger.L.Warn("Password mismatch for account deletion", "userID", userID)
			sendJSONError(w, "Incorrect password. Account deletion failed.", http.StatusForbidden)
			return
		}
	}

	// Begin transaction
	txDB, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Failed to begin transaction for account deletion", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}
	committed := false
	defer func() {
		if !committed && txDB != nil {
			rbErr := txDB.Rollback()
			if rbErr != nil {
				logger.L.Error("Error rolling back DB transaction for account deletion", "userID", userID, "rollbackError", rbErr)
			}
		}
	}()

	if _, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ?", userID); err != nil {
		logger.L.Error("Failed to delete processed transactions for user", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account data (transactions)", http.StatusInternalServerError)
		return
	}

	if _, err = txDB.Exec("DELETE FROM sessions WHERE user_id = ?", userID); err != nil {
		logger.L.Error("Failed to delete sessions for user", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account data (sessions)", http.StatusInternalServerError)
		return
	}

	if _, err = txDB.Exec("DELETE FROM users WHERE id = ?", userID); err != nil {
		logger.L.Error("Failed to delete user from users table", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete user account", http.StatusInternalServerError)
		return
	}

	if err = txDB.Commit(); err != nil {
		logger.L.Error("Failed to commit transaction for account deletion", "userID", userID, "error", err)
		sendJSONError(w, "Failed to finalize account deletion", http.StatusInternalServerError)
		return
	}
	committed = true

	logger.L.Info("Account deleted successfully", "userID", userID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *UserHandler) HandleCheckUserData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var count int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions WHERE user_id = ?", userID).Scan(&count)
	if err != nil {
		logger.L.Error("Error checking user data", "userID", userID, "error", err)
		sendJSONError(w, "failed to check user data", http.StatusInternalServerError)
		return
	}
	hasData := count > 0
	logger.L.Debug("User data check", "userID", userID, "hasData", hasData, "count", count)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"hasData": hasData})
}
