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
	redirectURL := fmt.Sprintf("%s/auth/google/callback?token=%s&user=%s",
		config.Cfg.FrontendBaseURL, // <-- USE THE CONFIG VARIABLE
		appToken,
		url.QueryEscape(string(contents)))
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}
