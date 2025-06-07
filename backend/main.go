package main

import (
	"encoding/json"
	stdlog "log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger"
	_ "github.com/username/taxfolio/backend/src/model" // Implicitly used by handlers
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
	"golang.org/x/time/rate"
)

var limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 30) // Example: 10 requests per second, burst 30

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
		// In production, replace "http://localhost:3000" with your actual frontend domain(s).
		allowedOrigins := map[string]bool{
			"http://localhost:3000": true,
			// Add other origins here if needed, e.g., "https://yourdomain.com"
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true") // Important for cookies/auth headers
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie, If-None-Match")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token, ETag") // Ensure ETag is exposed if used
		} else if origin == "" { // For requests from the same origin or tools like Postman that don't send Origin
			w.Header().Set("Access-Control-Allow-Origin", "*") // Be cautious with wildcard in production
		}

		if r.Method == "OPTIONS" {
			logger.L.Debug("Handling OPTIONS preflight request", "path", r.URL.Path, "origin", origin)
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	config.LoadConfig()
	logger.InitLogger(config.Cfg.LogLevel) // Initialize logger first
	logger.L.Info("Taxfolio backend server starting...")

	// Critical configuration checks
	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("JWT_SECRET configuration invalid. Must be at least 32 bytes.")
		os.Exit(1)
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("CSRF_AUTH_KEY must be at least 32 bytes long.")
		os.Exit(1)
	}

	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		logger.L.Error("Failed to load historical rates", "error", err)
		// Decide if this is a fatal error. For now, it logs and continues.
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
		// Decide if this is a fatal error.
	}

	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	logger.L.Info("Initializing report cache...")
	reportCache := cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval) // Use constants from services
	logger.L.Info("Report cache initialized.")

	logger.L.Info("Initializing services and handlers...")
	authService := security.NewAuthService(config.Cfg.JWTSecret)
	emailService := services.NewEmailService() // Email service initialization
	// If UserHandler needs uploadService, inject it here
	// userHandler := handlers.NewUserHandler(authService, emailService, uploadService)
	userHandler := handlers.NewUserHandler(authService, emailService)

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
	txHandler := handlers.NewTransactionHandler(uploadService)

	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()   // Main muxer for the application
	apiRouter := http.NewServeMux() // Muxer for /api prefixed routes

	// Public GET routes (no CSRF needed for these GETs as token is usually in query or no sensitive action)
	apiRouter.HandleFunc("GET /api/auth/csrf", handlers.GetCSRFToken)
	apiRouter.HandleFunc("GET /api/auth/verify-email", userHandler.VerifyEmailHandler) // Token in query param

	// Auth actions router - POST routes generally need CSRF
	authActionRouter := http.NewServeMux()
	authActionRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authActionRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authActionRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler)                          // Refresh might not need CSRF if token is in body and short-lived
	authActionRouter.HandleFunc("POST /logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler)) // Logout should be CSRF protected
	authActionRouter.HandleFunc("POST /request-password-reset", userHandler.RequestPasswordResetHandler)
	authActionRouter.HandleFunc("POST /reset-password", userHandler.ResetPasswordHandler)

	// Apply CSRF to the entire authActionRouter group
	apiRouter.Handle("/api/auth/", http.StripPrefix("/api/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authActionRouter)))

	// CSRF and Auth middleware for protected API routes
	csrfProtection := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)
	applyCsrfAndAuth := func(handler http.HandlerFunc) http.Handler {
		return csrfProtection(http.HandlerFunc(userHandler.AuthMiddleware(handler)))
	}

	// Protected Data Endpoints
	apiRouter.Handle("POST /api/upload", applyCsrfAndAuth(uploadHandler.HandleUpload))
	apiRouter.Handle("GET /api/realizedgains-data", applyCsrfAndAuth(uploadHandler.HandleGetRealizedGainsData))
	apiRouter.Handle("GET /api/transactions/processed", applyCsrfAndAuth(txHandler.HandleGetProcessedTransactions))
	apiRouter.Handle("GET /api/holdings/stocks", applyCsrfAndAuth(portfolioHandler.HandleGetStockHoldings))
	apiRouter.Handle("GET /api/holdings/options", applyCsrfAndAuth(portfolioHandler.HandleGetOptionHoldings))
	apiRouter.Handle("GET /api/stock-sales", applyCsrfAndAuth(portfolioHandler.HandleGetStockSales))
	apiRouter.Handle("GET /api/option-sales", applyCsrfAndAuth(portfolioHandler.HandleGetOptionSales))
	apiRouter.Handle("GET /api/dividend-tax-summary", applyCsrfAndAuth(dividendHandler.HandleGetDividendTaxSummary))
	apiRouter.Handle("GET /api/dividend-transactions", applyCsrfAndAuth(dividendHandler.HandleGetDividendTransactions))
	apiRouter.Handle("DELETE /api/transactions/all", applyCsrfAndAuth(txHandler.HandleDeleteAllProcessedTransactions))

	// User specific protected endpoints
	apiRouter.Handle("GET /api/user/has-data", applyCsrfAndAuth(userHandler.HandleCheckUserData))
	apiRouter.Handle("POST /api/user/change-password", applyCsrfAndAuth(userHandler.ChangePasswordHandler))
	apiRouter.Handle("POST /api/user/delete-account", applyCsrfAndAuth(userHandler.DeleteAccountHandler))

	// Mount the API router under /api/
	rootMux.Handle("/api/", apiRouter)

	// Root path handler
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// This specific check ensures that only exact "/" GET requests get the welcome message.
		// Other paths not starting with "/api/" and not matching "/" will fall through to the NotFound.
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
			return
		}
		// If it's not "/api/" (handled by apiRouter) and not exactly "/", then it's a 404.
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			logger.L.Warn("Root level path not found", "method", r.Method, "path", r.URL.Path)
			http.NotFound(w, r) // This will serve a 404 for paths like /foo or /bar
		}
		// If it starts with /api/ but doesn't match any apiRouter handlers, apiRouter itself will 404.
	})

	logger.L.Info("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux)) // CORS should usually be early, rate limiting after.

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
		stdlog.Fatalf("Failed to start server: %v", err) // Use stdlog for fatal before logger is fully up or if logger fails
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	}
}
