package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
)

type contextKey string

const userIDContextKey contextKey = "userID"

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
var passwordRegex = regexp.MustCompile(`^.{6,}$`) // Basic: at least 6 characters

type UserHandler struct {
	authService  *security.AuthService
	emailService services.EmailService
	// uploadService services.UploadService // Only add if you intend to use it here, e.g., for cache invalidation on delete
}

func NewUserHandler(authService *security.AuthService, emailService services.EmailService /*, uploadService services.UploadService */) *UserHandler {
	return &UserHandler{
		authService:  authService,
		emailService: emailService,
		// uploadService: uploadService,
	}
}

func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// Replace the entire RegisterUserHandler function with this updated version.
func (h *UserHandler) RegisterUserHandler(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	credentials.Username = strings.TrimSpace(credentials.Username)
	credentials.Email = strings.ToLower(strings.TrimSpace(credentials.Email))
	credentials.Password = strings.TrimSpace(credentials.Password)

	// **MODIFICATION**: Check for username as well now.
	if credentials.Username == "" || credentials.Email == "" || credentials.Password == "" {
		sendJSONError(w, "Username, email, and password are required", http.StatusBadRequest)
		return
	}
	if !emailRegex.MatchString(credentials.Email) {
		sendJSONError(w, "Invalid email format", http.StatusBadRequest)
		return
	}
	if !passwordRegex.MatchString(credentials.Password) {
		sendJSONError(w, "Password must be at least 6 characters long", http.StatusBadRequest)
		return
	}

	// Check for existing username
	_, err := model.GetUserByUsername(database.DB, credentials.Username)
	if err == nil {
		sendJSONError(w, "Username already exists", http.StatusConflict)
		return
	} else if !errors.Is(err, sql.ErrNoRows) && !strings.Contains(strings.ToLower(err.Error()), "user not found") {
		logger.L.Error("Error checking username uniqueness", "username", credentials.Username, "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

	// Check for existing email
	existingUser, err := model.GetUserByEmail(database.DB, credentials.Email)
	if err == nil {
		// **NEW LOGIC STARTS HERE**
		// User with this email exists. Check if they are verified.
		if existingUser.IsEmailVerified {
			// If verified, it's a conflict.
			sendJSONError(w, "Email address already in use", http.StatusConflict)
			return
		}

		// If NOT verified, resend the verification email.
		logger.L.Info("User exists but is not verified, resending verification email", "email", credentials.Email)
		tokenBytes := make([]byte, 32)
		if _, err := rand.Read(tokenBytes); err != nil {
			logger.L.Error("Failed to generate new verification token bytes for existing user", "error", err)
			sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
			return
		}
		verificationToken := hex.EncodeToString(tokenBytes)
		tokenExpiry := time.Now().Add(config.Cfg.VerificationTokenExpiry)

		// Update the user in the database with the new token
		if err := existingUser.UpdateVerificationToken(database.DB, verificationToken, tokenExpiry); err != nil {
			logger.L.Error("Failed to update verification token for existing user", "userID", existingUser.ID, "error", err)
			sendJSONError(w, "Failed to resend verification email", http.StatusInternalServerError)
			return
		}

		// Send the new verification email
		err = h.emailService.SendVerificationEmail(existingUser.Email, existingUser.Username, verificationToken)
		if err != nil {
			logger.L.Error("Failed to resend verification email", "userEmail", existingUser.Email, "error", err)
			// Still inform the user, but with a warning.
			sendJSONError(w, "Failed to send new verification email. Please try again later or contact support.", http.StatusInternalServerError)
			return
		}

		// Respond with a success message indicating a resend.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK) // Use 200 OK, not 201 Created
		json.NewEncoder(w).Encode(map[string]string{
			"message": "This email is already registered but not verified. We've sent a new verification link to your email address.",
		})
		return
		// **NEW LOGIC ENDS HERE**

	} else if !errors.Is(err, sql.ErrNoRows) && !strings.Contains(strings.ToLower(err.Error()), "user with this email not found") {
		logger.L.Error("Error checking email uniqueness", "email", credentials.Email, "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

	// This is the original path for a completely new user.
	hashedPassword, err := h.authService.HashPassword(credentials.Password)
	if err != nil {
		logger.L.Error("Failed to hash password", "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		logger.L.Error("Failed to generate verification token bytes", "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}
	verificationToken := hex.EncodeToString(tokenBytes)
	tokenExpiry := time.Now().Add(config.Cfg.VerificationTokenExpiry)

	newUser := &model.User{
		Username:                        credentials.Username,
		Email:                           credentials.Email,
		Password:                        hashedPassword,
		IsEmailVerified:                 false,
		EmailVerificationToken:          verificationToken,
		EmailVerificationTokenExpiresAt: tokenExpiry,
	}

	if err := newUser.CreateUser(database.DB); err != nil {
		logger.L.Error("Failed to create user in DB", "username", newUser.Username, "email", newUser.Email, "error", err)
		sendJSONError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	err = h.emailService.SendVerificationEmail(newUser.Email, newUser.Username, verificationToken)
	if err != nil {
		logger.L.Error("Failed to send verification email after user creation", "userEmail", newUser.Email, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "User registered. Failed to send verification email. Please contact support or try resending later.",
			"warning": "email_not_sent",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully. Please check your email to verify your account.",
	})
}

func (h *UserHandler) VerifyEmailHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		sendJSONError(w, "Verification token is missing", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByVerificationToken(database.DB, token)
	if err != nil {
		logger.L.Warn("Verification token lookup failed", "tokenPrefix", token[:min(10, len(token))], "error", err)
		sendJSONError(w, "Invalid or expired verification token.", http.StatusBadRequest)
		return
	}

	if user.IsEmailVerified {
		logger.L.Info("Email already verified", "userID", user.ID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Email already verified. You can log in."})
		return
	}

	if time.Now().After(user.EmailVerificationTokenExpiresAt) {
		logger.L.Warn("Verification token expired", "userID", user.ID, "tokenExpiry", user.EmailVerificationTokenExpiresAt)
		sendJSONError(w, "Verification token has expired. Please request a new one.", http.StatusBadRequest)
		return
	}

	if err := user.UpdateUserVerificationStatus(database.DB, true); err != nil {
		logger.L.Error("Failed to update user verification status in DB", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to verify email. Please try again or contact support.", http.StatusInternalServerError)
		return
	}

	logger.L.Info("Email verified successfully", "userID", user.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Email verified successfully! You can now log in."})
}

func (h *UserHandler) LoginUserHandler(w http.ResponseWriter, r *http.Request) {
	logger.L.Debug("Login request received", "remoteAddr", r.RemoteAddr)
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	var credentials struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		logger.L.Warn("Invalid request body for login", "error", err)
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	credentials.Email = strings.ToLower(strings.TrimSpace(credentials.Email))

	logger.L.Info("Login attempt", "email", credentials.Email)
	user, err := model.GetUserByEmail(database.DB, credentials.Email)
	if err != nil {
		logger.L.Warn("User lookup by email failed for login", "email", credentials.Email, "error", err)
		sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if err := user.CheckPassword(credentials.Password); err != nil {
		// CORRECTED THIS LINE
		logger.L.Warn("Password check failed for login", "email", credentials.Email, "error", err)
		sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if !user.IsEmailVerified {
		// AND CORRECTED THIS LINE
		logger.L.Warn("Login attempt failed: email not verified", "email", credentials.Email, "userID", user.ID)
		sendJSONError(w, "Email not verified. Please check your email for the verification link.", http.StatusForbidden)
		return
	}

	userIDStr := fmt.Sprintf("%d", user.ID)
	accessToken, err := h.authService.GenerateToken(userIDStr)
	if err != nil {
		logger.L.Error("Failed to generate access token", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to generate access token", http.StatusInternalServerError)
		return
	}

	refreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		logger.L.Error("Failed to generate refresh token", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to generate refresh token", http.StatusInternalServerError)
		return
	}

	session := &model.Session{
		UserID:       user.ID,
		Token:        accessToken,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry),
	}
	if err := model.CreateSession(database.DB, session); err != nil {
		logger.L.Error("Failed to create session", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	userData := map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          userData,
	})
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

type ChangePasswordRequest struct {
	CurrentPassword    string `json:"current_password"`
	NewPassword        string `json:"new_password"`
	ConfirmNewPassword string `json:"confirm_new_password"`
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

	// Optional: Invalidate other sessions for the user.
	// Could be done by deleting all sessions for user ID except the current one.
	// This requires getting the current session token, which is not straightforward here.
	// A simpler approach is to delete all sessions, forcing re-login on all devices.
	// Or, add a last_password_change_at timestamp to user and check against session.created_at.
	// For now, keeping it simple.

	logger.L.Info("Password changed successfully", "userID", userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password changed successfully."})
}

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

	if err := user.CheckPassword(req.Password); err != nil {
		logger.L.Warn("Password mismatch for account deletion", "userID", userID)
		sendJSONError(w, "Incorrect password. Account deletion failed.", http.StatusForbidden)
		return
	}

	// Begin transaction
	txDB, err := database.DB.Begin() // Renamed to txDB to avoid conflict with local tx
	if err != nil {
		logger.L.Error("Failed to begin transaction for account deletion", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}
	// Defer rollback/commit logic
	committed := false
	defer func() {
		if !committed && txDB != nil { // Check if txDB is not nil before rollback
			rbErr := txDB.Rollback()
			if rbErr != nil {
				logger.L.Error("Error rolling back DB transaction for account deletion", "userID", userID, "rollbackError", rbErr)
			}
		}
	}()

	// 1. Delete processed transactions
	if _, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ?", userID); err != nil {
		logger.L.Error("Failed to delete processed transactions for user", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account data (transactions)", http.StatusInternalServerError)
		return // err is set, defer will rollback
	}

	// 2. Delete sessions
	if _, err = txDB.Exec("DELETE FROM sessions WHERE user_id = ?", userID); err != nil {
		logger.L.Error("Failed to delete sessions for user", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete account data (sessions)", http.StatusInternalServerError)
		return // err is set, defer will rollback
	}

	// 3. Delete user
	if _, err = txDB.Exec("DELETE FROM users WHERE id = ?", userID); err != nil {
		logger.L.Error("Failed to delete user from users table", "userID", userID, "error", err)
		sendJSONError(w, "Failed to delete user account", http.StatusInternalServerError)
		return // err is set, defer will rollback
	}

	if err = txDB.Commit(); err != nil {
		logger.L.Error("Failed to commit transaction for account deletion", "userID", userID, "error", err)
		sendJSONError(w, "Failed to finalize account deletion", http.StatusInternalServerError)
		return // err is set, defer would have already rolled back due to commit error setting err
	}
	committed = true

	// If UserHandler had uploadService:
	// h.uploadService.InvalidateUserCache(userID)
	// Logger statement for this action would be inside InvalidateUserCache.

	logger.L.Info("Account deleted successfully", "userID", userID)
	w.WriteHeader(http.StatusNoContent) // 204 No Content is appropriate
}

func (h *UserHandler) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			logger.L.Debug("AuthMiddleware: Authorization header missing", "path", r.URL.Path)
			sendJSONError(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenString := ""
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			tokenString = authHeader
		}

		if tokenString == "" {
			logger.L.Debug("AuthMiddleware: Token string empty", "path", r.URL.Path)
			sendJSONError(w, "Malformed token", http.StatusUnauthorized)
			return
		}

		userIDStr, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			logger.L.Warn("AuthMiddleware: Token validation failed", "path", r.URL.Path, "error", err)
			sendJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			logger.L.Warn("AuthMiddleware: Session validation failed for access token", "path", r.URL.Path, "error", err)
			sendJSONError(w, "Invalid or expired session", http.StatusUnauthorized)
			return
		}

		userIDInt, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			logger.L.Error("AuthMiddleware: Invalid user ID format in token", "userIDStr", userIDStr, "error", err)
			sendJSONError(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), userIDContextKey, userIDInt)
		next(w, r.WithContext(ctx))
	}
}

func (h *UserHandler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	var requestBody struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.RefreshToken == "" {
		sendJSONError(w, "Refresh token is required", http.StatusBadRequest)
		return
	}

	oldSession, err := model.GetSessionByRefreshToken(database.DB, requestBody.RefreshToken)
	if err != nil {
		logger.L.Warn("Refresh token lookup failed or token invalid/expired", "error", err)
		sendJSONError(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	if err := model.DeleteSessionByRefreshToken(database.DB, requestBody.RefreshToken); err != nil {
		logger.L.Error("Failed to delete old session during refresh", "refreshTokenPrefix", requestBody.RefreshToken[:min(10, len(requestBody.RefreshToken))], "error", err)
	}

	userIDStr := fmt.Sprintf("%d", oldSession.UserID)
	newAccessToken, err := h.authService.GenerateToken(userIDStr)
	if err != nil {
		logger.L.Error("Failed to generate new access token on refresh", "userID", oldSession.UserID, "error", err)
		sendJSONError(w, "Failed to generate new access token", http.StatusInternalServerError)
		return
	}

	newRefreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		logger.L.Error("Failed to generate new refresh token on refresh", "userID", oldSession.UserID, "error", err)
		sendJSONError(w, "Failed to generate new refresh token", http.StatusInternalServerError)
		return
	}

	newSession := &model.Session{
		UserID:       oldSession.UserID,
		Token:        newAccessToken,
		RefreshToken: newRefreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry),
	}

	if err := model.CreateSession(database.DB, newSession); err != nil {
		logger.L.Error("Failed to create new session on refresh", "userID", oldSession.UserID, "error", err)
		sendJSONError(w, "Failed to create new session on refresh", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  newAccessToken,
		"refresh_token": newRefreshToken,
	})
}

func (h *UserHandler) LogoutUserHandler(w http.ResponseWriter, r *http.Request) {
	logger.L.Info("Logout request received")
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	authHeader := r.Header.Get("Authorization")
	tokenString := ""
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenString = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		tokenString = authHeader
	}

	if tokenString != "" {
		err := model.DeleteSessionByToken(database.DB, tokenString)
		if err != nil {
			logger.L.Warn("Failed to delete session on logout", "tokenPrefix", tokenString[:min(10, len(tokenString))], "error", err)
		} else {
			logger.L.Info("Session invalidated successfully on logout", "tokenPrefix", tokenString[:min(10, len(tokenString))])
		}
	} else {
		logger.L.Warn("Logout attempt with no token in Authorization header")
	}

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

func GetUserIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	return userID, ok
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
