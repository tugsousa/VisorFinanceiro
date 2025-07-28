package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

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

var (
	googleOauthConfig *oauth2.Config
	oauthStateString  = "random-string-for-security"
)

type UserHandler struct {
	authService  *security.AuthService
	emailService services.EmailService
}

func InitializeGoogleOAuthConfig() {
	googleOauthConfig = &oauth2.Config{
		RedirectURL:  config.Cfg.GoogleRedirectURL,
		ClientID:     config.Cfg.GoogleClientID,
		ClientSecret: config.Cfg.GoogleClientSecret,
		Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
		Endpoint:     google.Endpoint,
	}

}

func (h *UserHandler) HandleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	url := googleOauthConfig.AuthCodeURL(oauthStateString)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (h *UserHandler) HandleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if r.FormValue("state") != oauthStateString {
		logger.L.Warn("Invalid OAuth state from Google callback")
		http.Redirect(w, r, "/signin?error=invalid_state", http.StatusTemporaryRedirect)
		return
	}

	code := r.FormValue("code")
	token, err := googleOauthConfig.Exchange(context.Background(), code)
	if err != nil {
		logger.L.Error("Failed to exchange code for token", "error", err)
		http.Redirect(w, r, "/signin?error=token_exchange_failed", http.StatusTemporaryRedirect)
		return
	}

	response, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + token.AccessToken)
	if err != nil {
		logger.L.Error("Failed to get user info from Google", "error", err)
		http.Redirect(w, r, "/signin?error=userinfo_failed", http.StatusTemporaryRedirect)
		return
	}
	defer response.Body.Close()

	contents, err := io.ReadAll(response.Body)
	if err != nil {
		logger.L.Error("Failed to read user info response body", "error", err)
		http.Redirect(w, r, "/signin?error=userinfo_read_failed", http.StatusTemporaryRedirect)
		return
	}

	var googleUser struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Verified bool   `json:"verified_email"`
		ID       string `json:"id"`
	}
	if err := json.Unmarshal(contents, &googleUser); err != nil {
		logger.L.Error("Failed to unmarshal Google user info", "error", err)
		http.Redirect(w, r, "/signin?error=userinfo_parse_failed", http.StatusTemporaryRedirect)
		return
	}

	if !googleUser.Verified {
		http.Redirect(w, r, "/signin?error=email_not_verified_by_google", http.StatusTemporaryRedirect)
		return
	}

	// Lógica para encontrar ou criar o utilizador
	user, err := model.GetUserByEmail(database.DB, googleUser.Email)
	if err != nil { // Utilizador não existe, vamos criá-lo
		// CORREÇÃO: Usar o email como username para garantir unicidade e definir o AuthProvider
		newUser := &model.User{
			Username:        googleUser.Email, // Usar email como username garante unicidade
			Email:           googleUser.Email,
			Password:        "",       // Sem password para logins OAuth
			AuthProvider:    "google", // Definir o provedor
			IsEmailVerified: true,
		}

		if err := newUser.CreateUser(database.DB); err != nil {
			logger.L.Error("Failed to create Google user", "error", err)
			http.Redirect(w, r, "/signin?error=user_creation_failed", http.StatusTemporaryRedirect)
			return
		}
		user = newUser

	} else { // Utilizador já existe
		// CORREÇÃO: Verificar se a conta existente é local (tem password)
		if user.AuthProvider == "local" || user.Password != "" {
			logger.L.Warn("Google login attempt for existing local account", "email", user.Email)
			http.Redirect(w, r, "/signin?error=email_already_exists_local", http.StatusTemporaryRedirect)
			return
		}
	}

	// Gerar o nosso próprio token JWT para o frontend
	appToken, err := h.authService.GenerateToken(fmt.Sprintf("%d", user.ID))
	if err != nil {
		logger.L.Error("Failed to generate app token for Google user", "error", err)
		http.Redirect(w, r, "/signin?error=token_generation_failed", http.StatusTemporaryRedirect)
		return
	}

	// Redirecionar para uma página de callback no frontend com o token
	redirectURL := fmt.Sprintf("http://localhost:3000/auth/google/callback?token=%s&user=%s",
		appToken, url.QueryEscape(string(contents)))
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

func NewUserHandler(authService *security.AuthService, emailService services.EmailService) *UserHandler {
	return &UserHandler{
		authService:  authService,
		emailService: emailService,
	}
}

func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
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
			// Esta verificação pode falhar para tokens do Google, pois eles não criam uma sessão na nossa DB
			// Uma abordagem melhor seria verificar o AuthProvider do utilizador
			userIDIntCheck, _ := strconv.ParseInt(userIDStr, 10, 64)
			user, userErr := model.GetUserByID(database.DB, userIDIntCheck)
			if userErr != nil {
				logger.L.Warn("AuthMiddleware: User not found for token after session check failed", "userID", userIDStr, "error", userErr)
				sendJSONError(w, "Invalid session or user", http.StatusUnauthorized)
				return
			}
			// Se o utilizador for do Google, permitimos passar sem uma sessão na nossa DB.
			// Se for local e não tiver sessão, é um erro.
			if user.AuthProvider == "local" {
				logger.L.Warn("AuthMiddleware: Session validation failed for local user's access token", "path", r.URL.Path, "error", err)
				sendJSONError(w, "Invalid or expired session", http.StatusUnauthorized)
				return
			}
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
