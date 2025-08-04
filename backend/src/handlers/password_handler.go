package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
)

type ChangePasswordRequest struct {
	CurrentPassword    string `json:"current_password"`
	NewPassword        string `json:"new_password"`
	ConfirmNewPassword string `json:"confirm_new_password"`
}

func (h *UserHandler) RequestPasswordResetHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if !emailRegex.MatchString(req.Email) {
		sendJSONError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByEmail(database.DB, req.Email)
	if err != nil {
		logger.L.Info("Password reset requested for email, user not found or DB error, sending generic response", "email", req.Email, "errorIfAny", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "If an account with that email exists and is verified, a password reset link has been sent."})
		return
	}

	if !user.IsEmailVerified {
		logger.L.Info("Password reset requested for unverified email, sending generic response", "email", req.Email, "userID", user.ID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "If an account with that email exists and is verified, a password reset link has been sent."})
		return
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		logger.L.Error("Failed to generate password reset token bytes", "error", err)
		sendJSONError(w, "Failed to process password reset request", http.StatusInternalServerError)
		return
	}
	resetToken := hex.EncodeToString(tokenBytes)
	tokenExpiry := time.Now().Add(config.Cfg.PasswordResetTokenExpiry)

	if err := user.SetPasswordResetToken(database.DB, resetToken, tokenExpiry); err != nil {
		logger.L.Error("Failed to set password reset token in DB", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to process password reset request", http.StatusInternalServerError)
		return
	}

	err = h.emailService.SendPasswordResetEmail(user.Email, user.Username, resetToken)
	if err != nil {
		logger.L.Error("Failed to send password reset email", "userEmail", user.Email, "error", err)
	}

	logger.L.Info("Password reset email process initiated successfully", "email", req.Email, "userID", user.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "If an account with that email exists and is verified, a password reset link has been sent."})
}

func (h *UserHandler) ResetPasswordHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token           string `json:"token"`
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		sendJSONError(w, "Password reset token is missing", http.StatusBadRequest)
		return
	}
	if req.Password != req.ConfirmPassword {
		sendJSONError(w, "Passwords do not match", http.StatusBadRequest)
		return
	}
	if !passwordRegex.MatchString(req.Password) {
		sendJSONError(w, "Password must be at least 6 characters long", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByPasswordResetToken(database.DB, req.Token)
	if err != nil {
		logger.L.Warn("Password reset token lookup failed or token expired", "tokenPrefix", req.Token[:min(10, len(req.Token))], "error", err)
		sendJSONError(w, "Invalid or expired password reset token.", http.StatusBadRequest)
		return
	}

	hashedPassword, err := h.authService.HashPassword(req.Password)
	if err != nil {
		logger.L.Error("Failed to hash new password", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to reset password", http.StatusInternalServerError)
		return
	}

	if err := user.UpdatePassword(database.DB, hashedPassword); err != nil {
		logger.L.Error("Failed to update password in DB", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to reset password", http.StatusInternalServerError)
		return
	}

	logger.L.Info("Password reset successfully", "userID", user.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password has been reset successfully. You can now log in with your new password."})
}

func (h *UserHandler) ChangePasswordHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.NewPassword != req.ConfirmNewPassword {
		sendJSONError(w, "New passwords do not match", http.StatusBadRequest)
		return
	}
	if !passwordRegex.MatchString(req.NewPassword) {
		sendJSONError(w, "New password must be at least 6 characters long", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByID(database.DB, userID)
	if err != nil {
		logger.L.Error("Failed to get user for password change", "userID", userID, "error", err)
		sendJSONError(w, "Failed to retrieve user information", http.StatusInternalServerError)
		return
	}

	// CORREÇÃO: Impedir que utilizadores não-locais (ex: Google) mudem a password aqui
	if user.AuthProvider != "local" {
		logger.L.Warn("Attempt to change password for non-local account", "userID", userID, "provider", user.AuthProvider)
		sendJSONError(w, "Password cannot be changed for accounts created via Google.", http.StatusForbidden)
		return
	}

	if err := user.CheckPassword(req.CurrentPassword); err != nil {
		logger.L.Warn("Current password mismatch for password change", "userID", userID)
		sendJSONError(w, "Incorrect current password", http.StatusForbidden)
		return
	}

	hashedNewPassword, err := h.authService.HashPassword(req.NewPassword)
	if err != nil {
		logger.L.Error("Failed to hash new password", "userID", userID, "error", err)
		sendJSONError(w, "Failed to process new password", http.StatusInternalServerError)
		return
	}

	if err := user.UpdatePassword(database.DB, hashedNewPassword); err != nil {
		logger.L.Error("Failed to update password in DB", "userID", userID, "error", err)
		sendJSONError(w, "Failed to change password", http.StatusInternalServerError)
		return
	}

	logger.L.Info("Password changed successfully", "userID", userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password changed successfully."})
}
