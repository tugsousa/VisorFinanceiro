package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

func GetCSRFToken(w http.ResponseWriter, r *http.Request) {
	logger.L.Debug("Generating CSRF token", "remoteAddr", r.RemoteAddr)
	token := generateRandomToken()
	logger.L.Debug("Generated CSRF token value (first 5 chars for brevity)", "tokenPrefix", token[:5])

	http.SetCookie(w, &http.Cookie{
		Name:     "_gorilla_csrf",
		Value:    token,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		HttpOnly: true,
		Secure:   r.TLS != nil,
		MaxAge:   3600,
	})

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-CSRF-Token", token)

	json.NewEncoder(w).Encode(map[string]string{
		"csrfToken": token,
	})
}

func generateRandomToken() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		logger.L.Error("Error generating random bytes for CSRF token", "error", err)
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return base64.StdEncoding.EncodeToString(b)
}

func CSRFMiddleware(csrfKey []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Exempt "safe" methods from CSRF protection as per web standards.
			// This prevents errors on GET requests which shouldn't be state-changing.
			switch r.Method {
			case "GET", "HEAD", "OPTIONS":
				// Regista especificamente o motivo para ignorar a validação
				if r.Method == "OPTIONS" {
					logger.L.Debug("A ignorar a validação CSRF para o pedido preflight OPTIONS", "path", r.URL.Path)
				} else {
					logger.L.Debug("A ignorar a validação CSRF para método seguro", "method", r.Method, "path", r.URL.Path)
				}
				next.ServeHTTP(w, r)
				return
			}

			// Validação CSRF para métodos que alteram o estado (POST, PUT, DELETE, PATCH)
			headerToken := r.Header.Get("X-CSRF-Token")
			cookie, errCookie := r.Cookie("_gorilla_csrf")

			logger.L.Debug("Tentativa de validação CSRF para método que altera o estado",
				"method", r.Method,
				"path", r.URL.Path,
				"headerTokenExists", headerToken != "",
				"cookieError", errCookie,
			)

			if headerToken != "" && errCookie == nil && headerToken == cookie.Value {
				next.ServeHTTP(w, r)
				return
			}

			var cookieValForLog string
			if errCookie == nil {
				cookieValForLog = cookie.Value
			} else {
				cookieValForLog = "N/A"
			}

			var cookieErrorForLog interface{}
			if errCookie != nil {
				cookieErrorForLog = errCookie.Error()
			}

			logger.L.Warn("CSRF Validation Failed",
				slog.String("method", r.Method),
				slog.String("url", r.URL.String()),
				slog.String("headerToken", headerToken),
				slog.String("cookieValue", cookieValForLog),
				slog.Any("cookieError", cookieErrorForLog),
				slog.String("origin", r.Header.Get("Origin")),
				slog.String("referer", r.Header.Get("Referer")),
			)

			http.Error(w, "CSRF token validation failed", http.StatusForbidden)
		})
	}
}
