// backend/main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	_ "github.com/username/taxfolio/backend/src/model" // Ensure model package is initialized (for DB interactions potentially)
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"golang.org/x/time/rate" // For rate limiting
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

	// Root mux - handles non-API and the /api/ prefix
	rootMux := http.NewServeMux()

	// Handle the root path separately
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			if r.Method == http.MethodGet {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
			} else {
				// Corrected: Use http.StatusMethodNotAllowed for the status code
				http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			}
		} else {
			http.NotFound(w, r)
		}
	})

	// --- API Sub-Router (handles everything under /api/) ---
	apiRouter := http.NewServeMux()

	// --- Auth Sub-Router (for /api/auth/*) ---
	authSubRouter := http.NewServeMux()
	authSubRouter.HandleFunc("GET /csrf", handlers.GetCSRFToken)
	authSubRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authSubRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authSubRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler)
	apiRouter.Handle("/auth/", http.StripPrefix("/auth", handlers.CSRFMiddleware()(authSubRouter)))

	// --- Authenticated API Routes ---
	apiRouter.Handle("POST /upload", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleUpload))))
	apiRouter.Handle("GET /transactions/processed", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetProcessedTransactions))))
	apiRouter.Handle("GET /holdings/stocks", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetStockHoldings))))
	apiRouter.Handle("GET /holdings/options", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetOptionHoldings))))
	apiRouter.Handle("GET /stock-sales", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetStockSales))))
	apiRouter.Handle("GET /option-sales", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetOptionSales))))
	apiRouter.Handle("GET /dividend-tax-summary", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTaxSummary))))
	apiRouter.Handle("GET /dividend-transactions", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTransactions))))
	apiRouter.Handle("POST /logout", handlers.CSRFMiddleware()(http.HandlerFunc(userHandler.AuthMiddleware(userHandler.LogoutUserHandler))))

	// Mount the apiRouter under /api/ prefix on the rootMux
	rootMux.Handle("/api/", http.StripPrefix("/api", apiRouter))

	// --- Apply Global Middleware ---
	log.Println("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux))

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
