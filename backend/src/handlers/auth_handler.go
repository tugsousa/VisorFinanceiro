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
)

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

	if credentials.Username == "" && strings.Contains(credentials.Email, "@") {
		credentials.Username = strings.Split(credentials.Email, "@")[0]
	}

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

	_, err := model.GetUserByUsername(database.DB, credentials.Username)
	if err == nil {
		sendJSONError(w, "Username already exists", http.StatusConflict)
		return
	} else if !errors.Is(err, sql.ErrNoRows) && !strings.Contains(strings.ToLower(err.Error()), "user not found") {
		logger.L.Error("Error checking username uniqueness", "username", credentials.Username, "error", err)
		sendJSONError(w, "Failed to process registration", http.StatusInternalServerError)
		return
	}

	_, err = model.GetUserByEmail(database.DB, credentials.Email)
	if err == nil {
		sendJSONError(w, "Email address already in use", http.StatusConflict)
		return
	} else if !errors.Is(err, sql.ErrNoRows) && !strings.Contains(strings.ToLower(err.Error()), "user with this email not found") {
		logger.L.Error("Error checking email uniqueness", "email", credentials.Email, "error", err)
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
		AuthProvider:                    "local", // CORREÇÃO: Definir explicitamente como 'local'
		IsEmailVerified:                 false,
		EmailVerificationToken:          verificationToken,
		EmailVerificationTokenExpiresAt: tokenExpiry,
	}

	if err := user.CreateUser(database.DB); err != nil {
		logger.L.Error("Failed to create user in DB", "username", user.Username, "email", user.Email, "error", err)
		sendJSONError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	err = h.emailService.SendVerificationEmail(user.Email, user.Username, verificationToken)
	if err != nil {
		logger.L.Error("Failed to send verification email after user creation", "userEmail", user.Email, "error", err)
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
		logger.L.Warn("Password check failed for login", "email", credentials.Email, "error", err)
		sendJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if !user.IsEmailVerified {
		logger.L.Warn("Login attempt failed: email not verified. Resending verification.", "email", credentials.Email, "userID", user.ID)

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
					logger.L.Error("Failed to resend verification email on login attempt", "userEmail", user.Email, "error", err)
				} else {
					logger.L.Info("Resent verification email successfully on login attempt", "userEmail", user.Email)
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
		"id":            user.ID,
		"username":      user.Username,
		"email":         user.Email,
		"auth_provider": user.AuthProvider,
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
