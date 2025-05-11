package main

import (
	"encoding/json"
	stdlog "log" // Standard log for initial messages
	"net/http"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger" // Structured logger
	_ "github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
	"golang.org/x/time/rate"
)

var limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 30) // Example: 10 requests per second, burst of 30

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, http.StatusText(http.StatusTooManyRequests), http.StatusTooManyRequests)
			logger.L.Warn("Rate limit exceeded",
				"method", r.Method,
				"path", r.URL.Path,
				"remoteAddr", r.RemoteAddr)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		// Be more specific in production if possible, e.g., your frontend domain
		if origin == "http://localhost:3000" || origin == "" { // "" for same-origin or non-browser clients
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			// Note: For GET requests with Authorization, specific headers might not be needed in Allow-Headers
			// but for POST/PUT etc. they are.
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token") // Expose CSRF token to frontend
		}

		if r.Method == "OPTIONS" {
			logger.L.Debug("Handling OPTIONS preflight request", "path", r.URL.Path, "origin", origin)
			w.WriteHeader(http.StatusOK) // Preflight requests only need status OK
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// 1. Load Configuration
	config.LoadConfig()

	// 2. Initialize Logger (after config is loaded)
	logger.InitLogger(config.Cfg.LogLevel)
	logger.L.Info("Taxfolio backend server starting...")

	// Critical configuration checks
	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("FATAL: JWT_SECRET configuration invalid. Must be at least 32 bytes.")
		stdlog.Fatal("JWT_SECRET is not configured correctly.") // Use stdlog for fatal before full app init
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("FATAL: CSRF_AUTH_KEY must be at least 32 bytes long.")
		stdlog.Fatal("CSRF_AUTH_KEY is too short.")
	}

	// 3. Initialize Data Loaders (Rates, Country Data)
	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		logger.L.Error("Failed to load historical rates", "error", err)
		stdlog.Fatalf("Failed to load historical rates: %v", err)
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
		stdlog.Fatalf("Failed to load country data: %v", err)
	}

	// 4. Initialize Database
	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	// 5. Initialize Services and Core Handlers
	logger.L.Info("Initializing services and handlers...")
	authService := security.NewAuthService(config.Cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(authService) // User handler needs auth service

	csvParser := parsers.NewCSVParser()
	transactionProcessor := parsers.NewTransactionProcessor()
	dividendProcessor := processors.NewDividendProcessor()
	stockProcessor := processors.NewStockProcessor()
	optionProcessor := processors.NewOptionProcessor()
	cashMovementProcessor := processors.NewCashMovementProcessor()

	uploadService := services.NewUploadService(
		csvParser, transactionProcessor, dividendProcessor,
		stockProcessor, optionProcessor, cashMovementProcessor,
	)

	// Application-specific handlers
	uploadHandler := handlers.NewUploadHandler(uploadService)
	portfolioHandler := handlers.NewPortfolioHandler(uploadService)
	dividendHandler := handlers.NewDividendHandler(uploadService)
	txHandler := handlers.NewTransactionHandler() // Direct DB access for now

	// 6. Configure Routing
	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()   // Main mux for the server
	apiRouter := http.NewServeMux() // Router for all /api prefixed paths

	// --- Authentication Routes ---
	// These are defined first on apiRouter to ensure they are matched before a general /api/auth/ rule.
	// GET /api/auth/csrf: Publicly accessible to get CSRF token, does not need prior CSRF check.
	apiRouter.HandleFunc("GET /api/auth/csrf", handlers.GetCSRFToken)

	// POST /api/auth/refresh: Used to refresh access tokens. Does not need CSRF check.
	// Relies on the refresh token in the body for security.
	apiRouter.HandleFunc("POST /api/auth/refresh", userHandler.RefreshTokenHandler)

	// Sub-router for auth actions that DO require CSRF protection
	authProtectedRouter := http.NewServeMux()
	authProtectedRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authProtectedRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	// Logout is CSRF protected and also requires authentication (JWT)
	authProtectedRouter.HandleFunc("POST /logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler))
	// Mount this sub-router under /api/auth/, with CSRF protection applied to it.
	// Note: The paths inside authProtectedRouter are relative to its mounting point.
	// e.g., "POST /login" becomes POST /api/auth/login
	apiRouter.Handle("/api/auth/", http.StripPrefix("/api/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authProtectedRouter)))

	// --- Other Authenticated and CSRF-Protected API Routes ---
	// Create a CSRF middleware instance to wrap these handlers
	csrfProtection := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)

	// Helper function to chain AuthMiddleware and CSRFMiddleware
	applyCsrfAndAuth := func(handler http.HandlerFunc) http.Handler {
		return csrfProtection(http.HandlerFunc(userHandler.AuthMiddleware(handler)))
	}

	apiRouter.Handle("POST /api/upload", applyCsrfAndAuth(uploadHandler.HandleUpload))
	apiRouter.Handle("GET /api/dashboard-data", applyCsrfAndAuth(uploadHandler.HandleGetDashboardData))
	apiRouter.Handle("GET /api/transactions/processed", applyCsrfAndAuth(txHandler.HandleGetProcessedTransactions))
	apiRouter.Handle("GET /api/holdings/stocks", applyCsrfAndAuth(portfolioHandler.HandleGetStockHoldings))
	apiRouter.Handle("GET /api/holdings/options", applyCsrfAndAuth(portfolioHandler.HandleGetOptionHoldings))
	apiRouter.Handle("GET /api/stock-sales", applyCsrfAndAuth(portfolioHandler.HandleGetStockSales))
	apiRouter.Handle("GET /api/option-sales", applyCsrfAndAuth(portfolioHandler.HandleGetOptionSales))
	apiRouter.Handle("GET /api/dividend-tax-summary", applyCsrfAndAuth(dividendHandler.HandleGetDividendTaxSummary))
	apiRouter.Handle("GET /api/dividend-transactions", applyCsrfAndAuth(dividendHandler.HandleGetDividendTransactions))
	apiRouter.Handle("GET /api/user/has-data", applyCsrfAndAuth(userHandler.HandleCheckUserData))

	// Mount the apiRouter under the rootMux.
	// All requests to /api/... will be routed through apiRouter.
	rootMux.Handle("/api/", apiRouter) // No stripping prefix here, apiRouter handles full /api/... paths

	// Specific handler for GET / (root path)
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
		} else {
			// Any other path not /api/ and not GET / will be a 404.
			logger.L.Warn("Root level path not found", "method", r.Method, "path", r.URL.Path)
			http.NotFound(w, r)
		}
	})

	// 7. Apply Global Middlewares (CORS, Rate Limiting)
	logger.L.Info("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux))

	// 8. Start HTTP Server
	serverAddr := ":" + config.Cfg.Port
	server := &http.Server{
		Addr:         serverAddr,
		Handler:      finalHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	logger.L.Info("Server starting", "address", serverAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.L.Error("Failed to start server", "error", err)
		stdlog.Fatalf("Failed to start server: %v", err)
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	}
}
