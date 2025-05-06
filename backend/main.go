package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/csrf"
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
	csrfAuthKey = []byte("32-byte-long-auth-key") // TODO: Replace with actual secure key
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
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	authService := security.NewAuthService("your-secret-key-here") // TODO: Replace with actual JWT secret
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

	router := http.NewServeMux()

	// Public routes (no CSRF protection)
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("TAXFOLIO Backend is running"))
	})

	// API routes with CSRF protection
	apiRouter := http.NewServeMux()
	apiRouter.HandleFunc("/api/csrf-token", handlers.GetCSRFToken)
	apiRouter.HandleFunc("/api/login", userHandler.LoginUserHandler)
	apiRouter.HandleFunc("/api/register", userHandler.RegisterUserHandler)
	apiRouter.HandleFunc("/api/holdings/stocks", uploadHandler.HandleGetStockHoldings)
	apiRouter.HandleFunc("/api/holdings/options", uploadHandler.HandleGetOptionHoldings)

	// Apply CSRF protection to API routes
	csrfMiddleware := csrf.Protect(
		csrfAuthKey,
		csrf.Secure(false), // Set to true in production with HTTPS
		csrf.Path("/"),
		csrf.ErrorHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "CSRF token invalid", http.StatusForbidden)
		})),
	)

	protectedRouter := csrfMiddleware(apiRouter)
	rateLimitedRouter := rateLimitMiddleware(protectedRouter)
	corsRouter := enableCORS(rateLimitedRouter)
	database.InitDB()

	log.Println("Server running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", corsRouter); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
