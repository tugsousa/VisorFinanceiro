// backend/src/handlers/oauth_handler.go
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

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

	// --- NEW: Update Login Info ---
	updateUserLoginInfo(user.ID, r)
	// --- END NEW ---

	// 1. Check if the user is admin
	isUserAdmin := isAdmin(user.Email)

	// 2. Create a custom struct to send to the frontend
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

	// 3. Convert our struct to JSON
	userJSON, err := json.Marshal(userForFrontend)
	if err != nil {
		logger.L.Error("Failed to marshal custom user object for frontend", "error", err)
		http.Redirect(w, r, "/signin?error=user_data_build_failed", http.StatusTemporaryRedirect)
		return
	}

	// Generate our own JWT token for the frontend
	appToken, err := h.authService.GenerateToken(fmt.Sprintf("%d", user.ID))
	if err != nil {
		logger.L.Error("Failed to generate app token for Google user", "error", err)
		http.Redirect(w, r, "/signin?error=token_generation_failed", http.StatusTemporaryRedirect)
		return
	}

	// Redirect to a callback page on the frontend with the token and our user JSON
	redirectURL := fmt.Sprintf("%s/auth/google/callback?token=%s&user=%s",
		config.Cfg.FrontendBaseURL,
		appToken,
		url.QueryEscape(string(userJSON)))
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}
