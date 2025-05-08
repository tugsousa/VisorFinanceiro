package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	_ "github.com/username/taxfolio/backend/src/model" // Ensure model package is initialized
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"golang.org/x/time/rate"
)

var (
	// Rate limiter allowing 10 requests per second with burst of 30
	limiter = rate.NewLimiter(rate.Every(time.Second), 30)
)

// rateLimitMiddleware applies rate limiting to all requests
func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Log the request for debugging
		log.Printf("CORS middleware processing request from origin: %s", origin)
		log.Printf("Request method: %s, path: %s", r.Method, r.URL.Path)

		// Always set CORS headers for localhost frontend
		if origin == "http://localhost:3000" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
		}

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			log.Printf("Handling OPTIONS preflight request for %s", r.URL.Path)
			w.WriteHeader(http.StatusOK) // For OPTIONS, always return 200 OK
			return
		}

		// Log cookies for debugging
		log.Printf("Cookies in CORS middleware: %v", r.Cookies())

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Initialize JWT secret (replace with a strong, environment-variable-loaded secret)
	jwtSecret := "your-very-secure-and-long-jwt-secret-key-for-hs256"
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET must be at least 32 characters long for HS256")
	}
	authService := security.NewAuthService(jwtSecret)
	userHandler := handlers.NewUserHandler(authService)

	// Initialize parsers and processors
	csvParser := parsers.NewCSVParser()
	transactionProcessor := parsers.NewTransactionProcessor()
	dividendProcessor := processors.NewDividendProcessor()
	stockProcessor := processors.NewStockProcessor()
	optionProcessor := processors.NewOptionProcessor()
	cashMovementProcessor := processors.NewCashMovementProcessor()

	uploadService := services.NewUploadService(
		csvParser,
		transactionProcessor,
		dividendProcessor,
		stockProcessor,
		optionProcessor,
		cashMovementProcessor,
	)
	uploadHandler := handlers.NewUploadHandler(uploadService)

	// Main router for the application
	mainMux := http.NewServeMux()

	// Public routes (like base path or health check) - no CSRF, no Auth
	mainMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
	})
	mainMux.HandleFunc("/api/auth/csrf", handlers.GetCSRFToken) // CSRF token endpoint

	// Authentication routes (Login, Register) - These require CSRF but not AuthMiddleware yet
	authRouter := http.NewServeMux()
	authRouter.HandleFunc("/api/auth/login", userHandler.LoginUserHandler)
	authRouter.HandleFunc("/api/auth/register", userHandler.RegisterUserHandler)
	// The refresh token route might need special handling if CSRF is problematic here.
	// For now, let's keep it under CSRF.
	authRouter.HandleFunc("/api/auth/refresh", userHandler.RefreshTokenHandler)

	// Authenticated routes - These require AuthMiddleware and CSRF
	authenticatedRouter := http.NewServeMux()
	authenticatedRouter.HandleFunc("/api/upload", userHandler.AuthMiddleware(uploadHandler.HandleUpload))
	authenticatedRouter.HandleFunc("/api/transactions/processed", userHandler.AuthMiddleware(uploadHandler.HandleGetProcessedTransactions))
	authenticatedRouter.HandleFunc("/api/holdings/stocks", userHandler.AuthMiddleware(uploadHandler.HandleGetStockHoldings))   // Protected
	authenticatedRouter.HandleFunc("/api/holdings/options", userHandler.AuthMiddleware(uploadHandler.HandleGetOptionHoldings)) // Protected
	// Add the new logout route here, protected by AuthMiddleware
	authenticatedRouter.HandleFunc("/api/auth/logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler))

	// Apply CSRF middleware to authRouter and authenticatedRouter
	csrfProtectedAuthRouter := handlers.CSRFMiddleware()(authRouter)
	csrfProtectedAuthenticatedRouter := handlers.CSRFMiddleware()(authenticatedRouter)

	// Mount the CSRF-protected routers onto the main mux
	mainMux.Handle("/api/auth/login", csrfProtectedAuthRouter)
	mainMux.Handle("/api/auth/register", csrfProtectedAuthRouter)
	mainMux.Handle("/api/auth/refresh", csrfProtectedAuthRouter)

	mainMux.Handle("/api/upload", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/transactions/processed", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/holdings/stocks", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/holdings/options", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/auth/logout", csrfProtectedAuthenticatedRouter)

	// Apply global middlewares (CORS, Rate Limiting) to the mainMux
	finalHandler := enableCORS(rateLimitMiddleware(mainMux))

	database.InitDB()

	log.Println("Server running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", finalHandler); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
