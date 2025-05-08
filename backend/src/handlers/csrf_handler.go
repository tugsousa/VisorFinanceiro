package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

func GetCSRFToken(w http.ResponseWriter, r *http.Request) {
	log.Printf("Generating CSRF token for request from %s", r.RemoteAddr)
	log.Printf("Request headers: %v", r.Header)

	// Generate a random token
	token := generateRandomToken()
	log.Printf("Generated CSRF token: %s", token)

	// Log existing CSRF cookies for debugging
	log.Printf("All cookies before setting response: %v", r.Cookies())
	for _, cookie := range r.Cookies() {
		if cookie.Name == "_gorilla_csrf" {
			log.Printf("Found CSRF cookie: %s", cookie.Value)
		}
	}

	// Set the CSRF cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "_gorilla_csrf",
		Value:    token,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		MaxAge:   3600,  // 1 hour
	})

	// Set CORS headers to ensure the browser accepts the cookie
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")

	// Set the token in the response header and body
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-CSRF-Token", token)

	// Log response headers for debugging
	log.Printf("Response headers: %v", w.Header())

	json.NewEncoder(w).Encode(map[string]string{
		"csrfToken": token,
	})
}

// Generate a random token for CSRF protection
func generateRandomToken() string {
	// Generate a random token using crypto/rand
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		// If we can't generate random bytes, use a timestamp-based fallback
		log.Printf("Error generating random bytes: %v", err)
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return base64.StdEncoding.EncodeToString(b)
}

// Define the CSRF auth key here and export it so it can be used in main.go
var CSRFAuthKey = []byte("a-very-secure-32-byte-long-key-1234")

// Custom CSRF middleware that directly compares the token from the header with the token from the cookie
func CSRFMiddleware() func(http.Handler) http.Handler {
	// We're not using the gorilla/csrf middleware directly anymore, just implementing our own validation

	// Return a custom middleware that wraps the gorilla/csrf middleware
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip CSRF check for OPTIONS requests
			if r.Method == "OPTIONS" {
				log.Printf("Skipping CSRF validation for OPTIONS preflight request: %s", r.URL.Path)
				// Set CORS headers for OPTIONS requests
				origin := r.Header.Get("Origin")
				if origin == "http://localhost:3000" {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
					w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
					w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
				}
				w.WriteHeader(http.StatusOK)
				return
			}

			// Skip CSRF check for GET requests to /api/auth/csrf endpoint
			if r.Method == "GET" && r.URL.Path == "/csrf" { // Adjusted to match the path seen by the middleware
				log.Printf("Skipping CSRF validation for CSRF token endpoint: %s (Path seen by middleware)", r.URL.Path)
				next.ServeHTTP(w, r)
				return
			}

			// For all other requests, check if the CSRF token in the header matches the one in the cookie
			headerToken := r.Header.Get("X-CSRF-Token")
			cookie, err := r.Cookie("_gorilla_csrf")

			// Log for debugging
			log.Printf("CSRF validation for %s %s", r.Method, r.URL.Path)
			log.Printf("Header token: %s", headerToken)
			if err != nil {
				log.Printf("Cookie error: %v", err)
			} else {
				log.Printf("Cookie token: %s", cookie.Value)
			}

			// If we have both a header token and a cookie, and they match, proceed
			if headerToken != "" && err == nil && headerToken == cookie.Value {
				log.Printf("CSRF validation passed: tokens match")
				next.ServeHTTP(w, r)
				return
			}

			// If we get here, the CSRF validation failed
			log.Printf("CSRF Validation Failed at %s", time.Now().Format(time.RFC3339))
			log.Printf("Request Method: %s", r.Method)
			log.Printf("Request URL: %s", r.URL.String())
			log.Printf("Headers: %v", r.Header)
			log.Printf("Origin: %s", r.Header.Get("Origin"))
			log.Printf("Referer: %s", r.Header.Get("Referer"))

			// Log all cookies for debugging
			log.Printf("All cookies: %v", r.Cookies())

			// Set CORS headers for error response
			if origin := r.Header.Get("Origin"); origin == "http://localhost:3000" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
				w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
				w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
			}

			http.Error(w, "CSRF token validation failed", http.StatusForbidden)
		})
	}
}
