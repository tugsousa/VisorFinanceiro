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

// Helper to set the Refresh Token Cookie
func setRefreshTokenCookie(w http.ResponseWriter, refreshToken string, duration time.Duration) {
	cookie := &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/api/auth/refresh",
		HttpOnly: true,
		Secure:   config.Cfg.FrontendBaseURL[:5] == "https", // Secure in Prod (HTTPS)
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(duration.Seconds()),
	}
	http.SetCookie(w, cookie)
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

	// Derive username if empty
	if credentials.Username == "" && strings.Contains(credentials.Email, "@") {
		credentials.Username = strings.Split(credentials.Email, "@")[0]
	}

	// Validations
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
	if err := validatePasswordComplexity(credentials.Password); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
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

	tx, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Failed to begin registration transaction", "error", err)
		sendJSONError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 1. Create User
	now := time.Now()
	query := `
	INSERT INTO users (username, email, password, auth_provider, is_email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	res, err := tx.Exec(
		query,
		user.Username, user.Email, user.Password, user.AuthProvider,
		user.IsEmailVerified, user.EmailVerificationToken, user.EmailVerificationTokenExpiresAt,
		now, now,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			if strings.Contains(err.Error(), "users.username") {
				sendJSONError(w, "Username already exists", http.StatusConflict)
			} else {
				sendJSONError(w, "Email address already in use", http.StatusConflict)
			}
			return
		}
		logger.L.Error("Failed to insert user in DB", "error", err)
		sendJSONError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		logger.L.Error("Failed to get last insert ID", "error", err)
		sendJSONError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	user.ID = userID

	// 2. Create Default Portfolio
	_, err = tx.Exec("INSERT INTO portfolios (user_id, name, description, is_default) VALUES (?, ?, ?, ?)", user.ID, "Portfolio Principal", "Default Portfolio", true)
	if err != nil {
		logger.L.Error("Failed to create default portfolio", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to initialize account", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		logger.L.Error("Failed to commit registration", "error", err)
		sendJSONError(w, "Failed to finalize registration", http.StatusInternalServerError)
		return
	}

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
	if origin == "http://localhost:3000" || origin == "https://visorfinanceiro.pt" {
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

	// --- SECURITY UPDATE: Set Refresh Token in HttpOnly Cookie ---
	setRefreshTokenCookie(w, refreshToken, config.Cfg.RefreshTokenExpiry)

	logger.L.Info("User login successful, tokens generated", "userID", user.ID)

	userData := map[string]interface{}{
		"id":            user.ID,
		"username":      user.Username,
		"email":         user.Email,
		"auth_provider": user.AuthProvider,
		"is_admin":      user.IsAdmin,
		"mfa_enabled":   user.MfaEnabled,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token": accessToken,
		// "refresh_token" REMOVED from body
		"user": userData,
	})
}

func (h *UserHandler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	// --- SECURITY UPDATE: Read Refresh Token from Cookie ---
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		logger.L.Warn("Refresh request missing cookie", "error", err)
		sendJSONError(w, "Refresh token cookie required", http.StatusUnauthorized)
		return
	}
	refreshTokenStr := cookie.Value

	oldSession, err := model.GetSessionByRefreshToken(database.DB, refreshTokenStr)
	if err != nil {
		logger.L.Warn("Refresh token lookup failed or token invalid/expired", "error", err)
		// Clear invalid cookie
		http.SetCookie(w, &http.Cookie{Name: "refresh_token", Value: "", Path: "/api/auth/refresh", MaxAge: -1})
		sendJSONError(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	// Delete old session
	if err := model.DeleteSessionByRefreshToken(database.DB, refreshTokenStr); err != nil {
		logger.L.Error("Failed to delete old session during refresh", "error", err)
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

	// --- FETCH USER DATA TO RETURN ---
	// We need to return the user object so the frontend can restore state (e.g. after Google OAuth redirect)
	user, err := model.GetUserByID(database.DB, oldSession.UserID)
	if err != nil {
		logger.L.Error("Failed to retrieve user during refresh", "userID", oldSession.UserID, "error", err)
		sendJSONError(w, "Failed to retrieve user details", http.StatusInternalServerError)
		return
	}
	user.IsAdmin = isAdmin(user.Email)

	userData := map[string]interface{}{
		"id":            user.ID,
		"username":      user.Username,
		"email":         user.Email,
		"auth_provider": user.AuthProvider,
		"is_admin":      user.IsAdmin,
		"mfa_enabled":   user.MfaEnabled,
	}

	// --- ROTATION: Set NEW Refresh Token in Cookie ---
	setRefreshTokenCookie(w, newRefreshToken, config.Cfg.RefreshTokenExpiry)

	logger.L.Info("Token refreshed successfully", "userID", oldSession.UserID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token": newAccessToken,
		"user":         userData,
		// No refresh token in body
	})
}

func (h *UserHandler) LogoutUserHandler(w http.ResponseWriter, r *http.Request) {
	logger.L.Info("Logout request received")
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" || origin == "https://visorfinanceiro.pt" {
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
			logger.L.Warn("Failed to delete session on logout", "error", err)
		}
	}

	// --- SECURITY UPDATE: Clear Refresh Cookie ---
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth/refresh",
		HttpOnly: true,
		Secure:   config.Cfg.FrontendBaseURL[:5] == "https",
		MaxAge:   -1,
	})

	w.WriteHeader(http.StatusNoContent)
}
