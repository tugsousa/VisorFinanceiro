package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/csrf"
)

func GetCSRFToken(w http.ResponseWriter, r *http.Request) {
	log.Printf("Generating CSRF token for request from %s", r.RemoteAddr)
	log.Printf("Request headers: %v", r.Header)

	// Clear any existing CSRF cookies
	for _, cookie := range r.Cookies() {
		if cookie.Name == "_gorilla_csrf" {
			expiredCookie := &http.Cookie{
				Name:     "_gorilla_csrf",
				Value:    "",
				Path:     "/",
				MaxAge:   -1,
				HttpOnly: true,
			}
			http.SetCookie(w, expiredCookie)
			log.Printf("Cleared existing CSRF cookie: %s", cookie.Value)
		}
	}

	token := csrf.Token(r)
	log.Printf("Generated CSRF token: %s", token)
	log.Printf("Cookie: %v", r.Cookies())

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-CSRF-Token", token)
	json.NewEncoder(w).Encode(map[string]string{
		"csrfToken": token,
	})
}

func CSRFMiddleware() func(http.Handler) http.Handler {
	return csrf.Protect(
		[]byte("32-byte-long-auth-key"),
		csrf.Secure(false),
		csrf.ErrorHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("CSRF Validation Failed at %s", time.Now().Format(time.RFC3339))
			log.Printf("Request Method: %s", r.Method)
			log.Printf("Request URL: %s", r.URL.String())
			log.Printf("Headers: %v", r.Header)

			cookie, err := r.Cookie("_gorilla_csrf")
			if err != nil {
				log.Printf("CSRF Cookie Error: %v", err)
			} else {
				log.Printf("CSRF Cookie Value: %s", cookie.Value)
			}

			token := r.Header.Get("X-CSRF-Token")
			log.Printf("CSRF Header Token: %s", token)
			log.Printf("Tokens Match: %v", csrf.Token(r) == token)

			http.Error(w, "CSRF token validation failed", http.StatusForbidden)
		})),
	)
}
