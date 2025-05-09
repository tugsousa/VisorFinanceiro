package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	// "log" // Replaced with slog from logger package
	"net/http"
	"time"

	// To access CSRF key from config
	"github.com/username/taxfolio/backend/src/logger" // Use new logger
)

func GetCSRFToken(w http.ResponseWriter, r *http.Request) {
	logger.L.Debug("Generating CSRF token", "remoteAddr", r.RemoteAddr)
	// logger.L.Debug("Request headers for CSRF token generation", "headers", r.Header) // Can be verbose

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
			if r.Method == "OPTIONS" {
				logger.L.Debug("Skipping CSRF validation for OPTIONS preflight request", "path", r.URL.Path)
				w.WriteHeader(http.StatusOK)
				return
			}

			// Adjusted path checking for flexibility
			actualPath := r.URL.Path
			if strings.HasPrefix(actualPath, "/api/auth/") { // Example if middleware is applied at /api/
				actualPath = strings.TrimPrefix(actualPath, "/api/auth")
			} else if strings.HasPrefix(actualPath, "/auth/") { // Example if middleware is applied at / (and path is /auth/csrf)
				actualPath = strings.TrimPrefix(actualPath, "/auth")
			}

			if r.Method == "GET" && (actualPath == "/csrf" || actualPath == "csrf") {
				logger.L.Debug("Skipping CSRF validation for CSRF token endpoint", "path", r.URL.Path, "adjustedPath", actualPath)
				next.ServeHTTP(w, r)
				return
			}

			headerToken := r.Header.Get("X-CSRF-Token")
			cookie, errCookie := r.Cookie("_gorilla_csrf") // Renamed err to errCookie for clarity

			logger.L.Debug("CSRF validation attempt",
				"method", r.Method,
				"path", r.URL.Path,
				"headerTokenExists", headerToken != "",
				"cookieError", errCookie, // Use errCookie
			)

			if headerToken != "" && errCookie == nil && headerToken == cookie.Value {
				next.ServeHTTP(w, r)
				return
			}

			// Corrected logging arguments for slog
			var cookieValForLog string
			if errCookie == nil {
				cookieValForLog = cookie.Value
			} else {
				cookieValForLog = "N/A"
			}

			// Capture the cookie error to pass to slog if it's not nil
			var cookieErrorForLog interface{}
			if errCookie != nil {
				cookieErrorForLog = errCookie.Error()
			}

			logger.L.Warn("CSRF Validation Failed",
				slog.String("method", r.Method),
				slog.String("url", r.URL.String()),
				slog.String("headerToken", headerToken),
				slog.String("cookieValue", cookieValForLog), // Use the prepared string
				slog.Any("cookieError", cookieErrorForLog),  // Use the prepared error
				slog.String("origin", r.Header.Get("Origin")),
				slog.String("referer", r.Header.Get("Referer")),
			)

			http.Error(w, "CSRF token validation failed", http.StatusForbidden)
		})
	}
}
