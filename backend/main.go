package main

import (
	"encoding/json"
	stdlog "log" // Standard log for initial messages
	"net/http"
	"strings"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger"
	_ "github.com/username/taxfolio/backend/src/model" // User model used by handlers
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
		// In production, be more specific with allowed origins.
		// For development, allowing localhost:3000 is common.
		// Consider making the allowed origin configurable via config.Cfg.AllowedOrigin.
		allowedOrigins := map[string]bool{
			"http://localhost:3000": true,
			// Add other allowed origins here for production
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			// Ensure methods used by your frontend are listed
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			// Ensure headers sent by your frontend (including custom ones and If-None-Match) are listed
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie, If-None-Match")
			// Expose headers your frontend needs to read (like ETag and X-CSRF-Token)
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token, ETag")
		} else if origin == "" {
			// Allow requests with no Origin header (e.g. same-origin, curl, Postman)
			// Potentially be stricter here if needed
			w.Header().Set("Access-Control-Allow-Origin", "*") // Or a specific default if preferred
		}

		if r.Method == "OPTIONS" {
			logger.L.Debug("Handling OPTIONS preflight request", "path", r.URL.Path, "origin", origin)
			w.WriteHeader(http.StatusOK) // For OPTIONS, just send 200 OK with CORS headers
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
		logger.L.Error("JWT_SECRET configuration invalid. Must be at least 32 bytes.")
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("CSRF_AUTH_KEY must be at least 32 bytes long.")
	}

	// 3. Initialize Data Loaders (Rates, Country Data)
	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		logger.L.Error("Failed to load historical rates", "error", err)
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
	}
	// The http_utils.go for GenerateETag doesn't need an Init call, it's just a utility function.

	// 4. Initialize Database
	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	// 5. Initialize Cache for services
	logger.L.Info("Initializing report cache...")
	reportCache := cache.New(15*time.Minute, 30*time.Minute) // Default expiration, cleanup interval
	logger.L.Info("Report cache initialized.")

	// 6. Initialize Services and Core Handlers
	logger.L.Info("Initializing services and handlers...")
	authService := security.NewAuthService(config.Cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(authService)

	csvParser := parsers.NewCSVParser()
	transactionProcessor := parsers.NewTransactionProcessor()
	dividendProcessor := processors.NewDividendProcessor()
	stockProcessor := processors.NewStockProcessor()
	optionProcessor := processors.NewOptionProcessor()
	cashMovementProcessor := processors.NewCashMovementProcessor()

	uploadService := services.NewUploadService(
		csvParser, transactionProcessor, dividendProcessor,
		stockProcessor, optionProcessor, cashMovementProcessor,
		reportCache,
	)

	uploadHandler := handlers.NewUploadHandler(uploadService)
	portfolioHandler := handlers.NewPortfolioHandler(uploadService)
	dividendHandler := handlers.NewDividendHandler(uploadService)
	txHandler := handlers.NewTransactionHandler()

	// 7. Configure Routing
	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()
	apiRouter := http.NewServeMux()

	// --- Authentication Routes (Public or CSRF-protected for token refresh) ---
	apiRouter.HandleFunc("GET /api/auth/csrf", handlers.GetCSRFToken) // Should not be auth-protected, might not need CSRF on CSRF itself

	// Group for auth actions that need CSRF but not JWT auth (like login, register)
	// and actions that need both (like logout, or refresh if you choose so)
	authActionRouter := http.NewServeMux()
	authActionRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authActionRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authActionRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler)                          // Refresh might not need CSRF if it's bearer token based for refresh token
	authActionRouter.HandleFunc("POST /logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler)) // Needs JWT auth and CSRF

	// Apply CSRF protection to the /auth/ group
	apiRouter.Handle("/api/auth/", http.StripPrefix("/api/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authActionRouter)))

	// --- Other Authenticated and CSRF-Protected API Routes ---
	csrfProtection := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)
	applyCsrfAndAuth := func(handler http.HandlerFunc) http.Handler {
		return csrfProtection(http.HandlerFunc(userHandler.AuthMiddleware(handler)))
	}

	// Routes requiring both JWT authentication and CSRF protection
	apiRouter.Handle("POST /api/upload", applyCsrfAndAuth(uploadHandler.HandleUpload))
	apiRouter.Handle("GET /api/realizedgains-data", applyCsrfAndAuth(uploadHandler.HandleGetRealizedGainsData)) // ETag logic is inside this handler
	apiRouter.Handle("GET /api/transactions/processed", applyCsrfAndAuth(txHandler.HandleGetProcessedTransactions))
	apiRouter.Handle("GET /api/holdings/stocks", applyCsrfAndAuth(portfolioHandler.HandleGetStockHoldings))
	apiRouter.Handle("GET /api/holdings/options", applyCsrfAndAuth(portfolioHandler.HandleGetOptionHoldings))
	apiRouter.Handle("GET /api/stock-sales", applyCsrfAndAuth(portfolioHandler.HandleGetStockSales))
	apiRouter.Handle("GET /api/option-sales", applyCsrfAndAuth(portfolioHandler.HandleGetOptionSales))
	apiRouter.Handle("GET /api/dividend-tax-summary", applyCsrfAndAuth(dividendHandler.HandleGetDividendTaxSummary))
	apiRouter.Handle("GET /api/dividend-transactions", applyCsrfAndAuth(dividendHandler.HandleGetDividendTransactions))
	apiRouter.Handle("GET /api/user/has-data", applyCsrfAndAuth(userHandler.HandleCheckUserData))

	rootMux.Handle("/api/", apiRouter) // All /api/ prefixed routes go through apiRouter

	// Basic root handler
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
		} else {
			// Let apiRouter handle /api/ not found, otherwise it's a true root level not found
			if !strings.HasPrefix(r.URL.Path, "/api/") {
				logger.L.Warn("Root level path not found", "method", r.Method, "path", r.URL.Path)
				http.NotFound(w, r)
			}
			// If it starts with /api/ but wasn't matched by apiRouter, apiRouter's default NotFound will trigger
		}
	})

	// 8. Apply Global Middlewares (CORS, Rate Limiting)
	logger.L.Info("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux))

	// 9. Start HTTP Server
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
		stdlog.Fatalf("Failed to start server: %v", err) // Use stdlog for fatal before logger might be fully flushed
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	}
}
