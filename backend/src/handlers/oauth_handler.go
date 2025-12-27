// backend/src/handlers/oauth_handler.go
package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
)

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
	url := googleOauthConfig.AuthCodeURL(config.Cfg.OAuthStateString)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (h *UserHandler) HandleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if r.FormValue("state") != config.Cfg.OAuthStateString {
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

	// Logic to find or create the user
	user, err := model.GetUserByEmail(database.DB, googleUser.Email)
	if err != nil { // User doesn't exist, create them
		newUser := &model.User{
			Username:        googleUser.Email,
			Email:           googleUser.Email,
			Password:        "",
			AuthProvider:    "google",
			IsEmailVerified: true,
		}

		if err := newUser.CreateUser(database.DB); err != nil {
			logger.L.Error("Failed to create Google user", "error", err)
			http.Redirect(w, r, "/signin?error=user_creation_failed", http.StatusTemporaryRedirect)
			return
		}
		user = newUser

	} else { // User already exists
		if user.AuthProvider == "local" || user.Password != "" {
			logger.L.Warn("Google login attempt for existing local account", "userID", user.ID)
			http.Redirect(w, r, "/signin?error=email_already_exists_local", http.StatusTemporaryRedirect)
			return
		}
	}

	updateUserLoginInfo(user.ID, r)

	isUserAdmin := isAdmin(user.Email)

	userForFrontend := struct {
		ID           int64  `json:"id"`
		Username     string `json:"username"`
		Email        string `json:"email"`
		AuthProvider string `json:"auth_provider"`
		IsAdmin      bool   `json:"is_admin"`
		MfaEnabled   bool   `json:"mfa_enabled"`
	}{
		ID:           user.ID,
		Username:     user.Username,
		Email:        user.Email,
		AuthProvider: user.AuthProvider,
		IsAdmin:      isUserAdmin,
		MfaEnabled:   user.MfaEnabled,
	}

	userJSON, err := json.Marshal(userForFrontend)
	if err != nil {
		logger.L.Error("Failed to marshal custom user object for frontend", "error", err)
		http.Redirect(w, r, "/signin?error=user_data_build_failed", http.StatusTemporaryRedirect)
		return
	}

	appToken, err := h.authService.GenerateToken(fmt.Sprintf("%d", user.ID))
	if err != nil {
		logger.L.Error("Failed to generate app token for Google user", "error", err)
		http.Redirect(w, r, "/signin?error=token_generation_failed", http.StatusTemporaryRedirect)
		return
	}

	// --- SECURITY FIX: Transfer token via Cookie instead of URL ---

	// Create a JSON object containing both the token and the user data
	transferData := map[string]string{
		"token": appToken,
		"user":  string(userJSON),
	}
	transferBytes, _ := json.Marshal(transferData)

	// Encode to Base64 to ensure it is cookie-safe
	encodedData := base64.StdEncoding.EncodeToString(transferBytes)

	// Set a short-lived cookie (1 minute)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_transfer",
		Value:    encodedData,
		Path:     "/",
		Expires:  time.Now().Add(1 * time.Minute),
		HttpOnly: false,                                     // Frontend needs to read this!
		Secure:   config.Cfg.FrontendBaseURL[:5] == "https", // Secure only if prod
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to frontend without sensitive data in URL
	redirectURL := fmt.Sprintf("%s/auth/google/callback", config.Cfg.FrontendBaseURL)
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}
