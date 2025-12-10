package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/security/validation"
)

// Helper function to check if an email belongs to an admin.
func isAdmin(email string) bool {
	for _, adminEmail := range config.Cfg.AdminEmails {
		if strings.EqualFold(email, adminEmail) {
			return true
		}
	}
	return false
}

// updateUserLoginInfo updates user's login stats and records the login event.
func updateUserLoginInfo(userID int64, r *http.Request) {
	tx, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Failed to begin transaction for login info update", "userID", userID, "error", err)
		return
	}
	defer tx.Rollback() // Rollback on error

	// 1. Update the users table
	_, err = tx.Exec(`
		UPDATE users 
		SET 
			login_count = login_count + 1, 
			last_login_at = CURRENT_TIMESTAMP, 
			last_login_ip = ?
		WHERE id = ?`,
		r.RemoteAddr, userID,
	)
	if err != nil {
		logger.L.Error("Failed to update users table on login", "userID", userID, "error", err)
		return
	}

	// 2. Insert into login_history
	_, err = tx.Exec(`
		INSERT INTO login_history (user_id, ip_address, user_agent) 
		VALUES (?, ?, ?)`,
		userID, r.RemoteAddr, r.UserAgent(),
	)
	if err != nil {
		logger.L.Error("Failed to insert into login_history", "userID", userID, "error", err)
		return
	}

	if err := tx.Commit(); err != nil {
		logger.L.Error("Failed to commit transaction for login info update", "userID", userID, "error", err)
	}
}

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

	// Sanitization
	credentials.Username = validation.SanitizeText(strings.TrimSpace(credentials.Username))
	credentials.Email = strings.ToLower(validation.SanitizeText(strings.TrimSpace(credentials.Email)))
	credentials.Password = strings.TrimSpace(credentials.Password)

	if credentials.Username == "" && strings.Contains(credentials.Email, "@") {
		credentials.Username = strings.Split(credentials.Email, "@")[0]
	}

	// Validation
	if credentials.Username == "" {
		sendJSONError(w, "Username is required", http.StatusBadRequest)
		return
	}
	if err := validation.ValidateStringMaxLength(credentials.Username, 50, "Username"); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validation.ValidateStringNotEmpty(credentials.Email, "Email"); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !emailRegex.MatchString(credentials.Email) {
		sendJSONError(w, "Invalid email format", http.StatusBadRequest)
		return
	}
	if err := validation.ValidateStringNotEmpty(credentials.Password, "Password"); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !passwordRegex.MatchString(credentials.Password) {
		sendJSONError(w, "Password must be at least 6 characters long", http.StatusBadRequest)
		return
	}

	// Check username uniqueness
	_, err := model.GetUserByUsername(database.DB, credentials.Username)
	if err == nil {
		sendJSONError(w, "Username already exists", http.StatusConflict)
		return
	} else if !errors.Is(err, sql.ErrNoRows) {
		logger.L.Error("Error checking username uniqueness", "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

	// Check email uniqueness
	_, err = model.GetUserByEmail(database.DB, credentials.Email)
	if err == nil {
		sendJSONError(w, "Email address already in use", http.StatusConflict)
		return
	} else if !errors.Is(err, sql.ErrNoRows) {
		logger.L.Error("Error checking email uniqueness", "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

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

	user := &model.User{
		Username:                        credentials.Username,
		Email:                           credentials.Email,
		Password:                        hashedPassword,
		AuthProvider:                    "local",
		IsEmailVerified:                 false,
		EmailVerificationToken:          verificationToken,
		EmailVerificationTokenExpiresAt: tokenExpiry,
	}

	if err := user.CreateUser(database.DB); err != nil {
		logger.L.Error("Failed to create user in DB", "error", err)
		sendJSONError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// --- MULTI-PORTFOLIO CHANGE START ---
	// Create a default portfolio for the new user
	_, err = database.DB.Exec("INSERT INTO portfolios (user_id, name, description, is_default) VALUES (?, ?, ?, ?)", user.ID, "Main Portfolio", "Default Portfolio", true)
	if err != nil {
		// Log error but don't fail the request (email still needs sending).
		// User might see an empty dashboard and can create one manually later.
		logger.L.Error("Failed to create default portfolio for new user", "userID", user.ID, "error", err)
	}
	// --- MULTI-PORTFOLIO CHANGE END ---

	logger.L.Info("User registered, verification email to be sent", "userID", user.ID)

	err = h.emailService.SendVerificationEmail(user.Email, user.Username, verificationToken)
	if err != nil {
		logger.L.Error("Failed to send verification email after user creation", "userID", user.ID, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Utilizador registado. Falha ao enviar o e-mail de verificação. Por favor, contacte o suporte ou tente reenviar mais tarde.",
			"warning": "email_not_sent",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Utilizador registado com sucesso. Por favor, verifique o seu e-mail para confirmar a sua conta.",
	})
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

	credentials.Email = strings.ToLower(validation.SanitizeText(strings.TrimSpace(credentials.Email)))

	logger.L.Info("Login attempt received")
	user, err := model.GetUserByEmail(database.DB, credentials.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			logger.L.Warn("User lookup by email failed for login: user not found", "email", credentials.Email)
			sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
			return
		}
		logger.L.Error("User lookup by email failed for login", "error", err)
		sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if err := user.CheckPassword(credentials.Password); err != nil {
		logger.L.Warn("Password check failed for login", "userID", user.ID, "error", err)
		sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if !user.IsEmailVerified {
		logger.L.Warn("Login attempt failed: email not verified. Resending verification.", "userID", user.ID)

		tokenBytes := make([]byte, 32)
		if _, err := rand.Read(tokenBytes); err != nil {
			logger.L.Error("Failed to generate new verification token on login attempt", "userID", user.ID, "error", err)
		} else {
			verificationToken := hex.EncodeToString(tokenBytes)
			tokenExpiry := time.Now().Add(config.Cfg.VerificationTokenExpiry)

			if err := user.UpdateUserVerificationToken(database.DB, verificationToken, tokenExpiry); err != nil {
				logger.L.Error("Failed to update verification token in DB on login attempt", "userID", user.ID, "error", err)
			} else {
				err = h.emailService.SendVerificationEmail(user.Email, user.Username, verificationToken)
				if err != nil {
					logger.L.Error("Failed to resend verification email on login attempt", "userID", user.ID, "error", err)
				} else {
					logger.L.Info("Resent verification email successfully on login attempt", "userID", user.ID)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "O teu e-mail ainda não foi verificado. Enviámos um novo link de verificação para o seu endereço de email.",
			"code":  "EMAIL_NOT_VERIFIED",
		})
		return
	}

	updateUserLoginInfo(user.ID, r)

	user.IsAdmin = isAdmin(user.Email)

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

	logger.L.Info("User login successful, tokens generated", "userID", user.ID)

	userData := map[string]interface{}{
		"id":            user.ID,
		"username":      user.Username,
		"email":         user.Email,
		"auth_provider": user.AuthProvider,
		"is_admin":      user.IsAdmin,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          userData,
	})
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

	logger.L.Info("Token refreshed successfully", "userID", oldSession.UserID)

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
