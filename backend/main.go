// backend/main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os" // Import os package for environment variables
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	_ "github.com/username/taxfolio/backend/src/model" // Ensure model package is initialized (for DB interactions potentially)
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"golang.org/x/time/rate"
)

var (
	// Rate limiter allowing 10 requests per second with burst of 30 (adjust as needed)
	limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 30)
)

// rateLimitMiddleware applies rate limiting to incoming requests.
func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, http.StatusText(http.StatusTooManyRequests), http.StatusTooManyRequests)
			log.Printf("Rate limit exceeded for %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// enableCORS configures Cross-Origin Resource Sharing.
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		// Allow requests from the frontend development server
		// In production, restrict this to your actual frontend domain.
		if origin == "http://localhost:3000" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true") // Crucial for cookies (CSRF, session)
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token") // Allow frontend to read this header
		}

		// Handle preflight requests (OPTIONS method)
		if r.Method == "OPTIONS" {
			log.Printf("Handling OPTIONS preflight request for %s from %s", r.URL.Path, origin)
			w.WriteHeader(http.StatusOK) // Always respond OK to OPTIONS preflight for allowed origins
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Starting Taxfolio backend server...")

	// --- Configuration ---
	// Best practice: Load sensitive keys from environment variables.
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Println("WARNING: JWT_SECRET environment variable not set. Using default insecure key.")
		jwtSecret = "your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes" // Default for dev only
	}
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET must be at least 32 characters long for HS256")
	}

	// --- Dependency Injection ---
	log.Println("Initializing services and handlers...")
	authService := security.NewAuthService(jwtSecret)
	userHandler := handlers.NewUserHandler(authService)

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

	// --- Database Initialization ---
	log.Println("Initializing database...")
	database.InitDB()
	log.Println("Database initialized.")

	// --- Router Setup ---
	log.Println("Configuring routes...")
	mainMux := http.NewServeMux()

	// --- Public Routes ---
	// No CSRF or Auth required
	mainMux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) { // Explicitly GET
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
	})
	mainMux.HandleFunc("GET /api/auth/csrf", handlers.GetCSRFToken) // Endpoint to get CSRF token

	// --- Authentication Routes ---
	// Require CSRF but not user authentication (AuthMiddleware) yet
	authRouter := http.NewServeMux()
	authRouter.HandleFunc("POST /api/auth/login", userHandler.LoginUserHandler)
	authRouter.HandleFunc("POST /api/auth/register", userHandler.RegisterUserHandler)
	authRouter.HandleFunc("POST /api/auth/refresh", userHandler.RefreshTokenHandler) // Typically POST

	// --- Authenticated API Routes ---
	// Require both CSRF and user authentication (AuthMiddleware)
	authenticatedRouter := http.NewServeMux()
	// Upload
	authenticatedRouter.HandleFunc("POST /api/upload", userHandler.AuthMiddleware(uploadHandler.HandleUpload))

	// Data Retrieval (typically GET)
	authenticatedRouter.HandleFunc("GET /api/transactions/processed", userHandler.AuthMiddleware(uploadHandler.HandleGetProcessedTransactions))
	authenticatedRouter.HandleFunc("GET /api/holdings/stocks", userHandler.AuthMiddleware(uploadHandler.HandleGetStockHoldings))
	authenticatedRouter.HandleFunc("GET /api/holdings/options", userHandler.AuthMiddleware(uploadHandler.HandleGetOptionHoldings))
	authenticatedRouter.HandleFunc("GET /api/stock-sales", userHandler.AuthMiddleware(uploadHandler.HandleGetStockSales))
	authenticatedRouter.HandleFunc("GET /api/option-sales", userHandler.AuthMiddleware(uploadHandler.HandleGetOptionSales))
	authenticatedRouter.HandleFunc("GET /api/dividend-tax-summary", userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTaxSummary))
	authenticatedRouter.HandleFunc("GET /api/dividend-transactions", userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTransactions))

	// Auth actions for logged-in users
	authenticatedRouter.HandleFunc("POST /api/auth/logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler))

	// --- Apply Middleware ---
	log.Println("Applying middleware...")
	// Apply CSRF protection specifically to routes that need it
	csrfProtectedAuthRouter := handlers.CSRFMiddleware()(authRouter)
	csrfProtectedAuthenticatedRouter := handlers.CSRFMiddleware()(authenticatedRouter)

	// --- Mount Routers ---
	// Mount CSRF-protected authentication routes
	mainMux.Handle("/api/auth/login", csrfProtectedAuthRouter)
	mainMux.Handle("/api/auth/register", csrfProtectedAuthRouter)
	mainMux.Handle("/api/auth/refresh", csrfProtectedAuthRouter)

	// Mount CSRF-protected and Auth-Middleware-protected authenticated routes
	// Use prefixes to catch all relevant paths handled by the authenticatedRouter
	// NOTE: Using specific paths is generally safer than a broad prefix if routes overlap.
	// If all your authenticated API routes start with "/api/" and are handled by authenticatedRouter,
	// this prefix approach *could* work, but explicit mounting is less error-prone.
	// Let's stick to explicit mounting for clarity and safety.

	mainMux.Handle("/api/upload", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/transactions/processed", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/holdings/stocks", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/holdings/options", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/stock-sales", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/option-sales", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/dividend-tax-summary", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/dividend-transactions", csrfProtectedAuthenticatedRouter)
	mainMux.Handle("/api/auth/logout", csrfProtectedAuthenticatedRouter)

	// --- Apply Global Middleware ---
	// Apply CORS first, then rate limiting to the main router
	finalHandler := enableCORS(rateLimitMiddleware(mainMux))

	// --- Start Server ---
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port if not specified
	}
	serverAddr := ":" + port
	log.Printf("Server configured successfully. Attempting to listen on %s", serverAddr)

	server := &http.Server{
		Addr:         serverAddr,
		Handler:      finalHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Server starting on %s", serverAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start server: %v", err)
	} else {
		log.Println("Server stopped gracefully.")
	}
}
