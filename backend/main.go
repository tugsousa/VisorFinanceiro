package main

import (
	"encoding/json"
	stdlog "log" // Standard log for fatal errors before logger is fully up
	"net/http"

	// "os" // No longer needed for PORT, JWT_SECRET directly
	"time"

	"github.com/username/taxfolio/backend/src/config" // Import config
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger"  // Import logger
	_ "github.com/username/taxfolio/backend/src/model" // model is used by handlers etc.
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
	"golang.org/x/time/rate"
)

var limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 30)

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
		// Allow requests from the frontend development server (configurable in future if needed)
		// For production, restrict this to your actual frontend domain.
		// Example: allowedOrigins := map[string]bool{"http://localhost:3000": true, "https://yourdomain.com": true}
		// if allowedOrigins[origin] { ... }
		if origin == "http://localhost:3000" { // TODO: Make this configurable for production
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH") // Added PATCH
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
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
	// 1. Load Configuration
	config.LoadConfig()

	// 2. Initialize Logger (depends on config)
	logger.InitLogger(config.Cfg.LogLevel)
	logger.L.Info("Taxfolio backend server starting...")

	// 3. Validate critical configurations
	if config.Cfg.JWTSecret == "" {
		logger.L.Error("FATAL: JWT_SECRET environment variable not set and no default provided in config.")
		stdlog.Fatal("JWT_SECRET is not configured.") // Use stdlog for fatal before server starts
	}
	if len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("FATAL: JWT_SECRET must be at least 32 characters long for HS256.", "currentLength", len(config.Cfg.JWTSecret))
		stdlog.Fatal("JWT_SECRET is too short.")
	}
	if len(config.Cfg.CSRFAuthKey) < 32 { // Already checked in config.Load, but double check
		logger.L.Error("FATAL: CSRF_AUTH_KEY must be at least 32 bytes long.", "currentLength", len(config.Cfg.CSRFAuthKey))
		stdlog.Fatal("CSRF_AUTH_KEY is too short.")
	}

	// 4. Initialize Data Loaders (depend on config)
	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		logger.L.Error("Failed to load historical rates", "error", err)
		stdlog.Fatalf("Failed to load historical rates: %v", err)
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
		stdlog.Fatalf("Failed to load country data: %v", err)
	}

	// 5. Initialize Database (depends on config)
	logger.L.Info("Initializing database...")
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	// 6. Dependency Injection for Services and Handlers
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
	)
	uploadHandler := handlers.NewUploadHandler(uploadService)

	// 7. Router Setup
	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			if r.Method == http.MethodGet {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
			} else {
				http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			}
		} else {
			http.NotFound(w, r)
		}
	})

	apiRouter := http.NewServeMux()
	authSubRouter := http.NewServeMux()
	authSubRouter.HandleFunc("GET /csrf", handlers.GetCSRFToken)
	authSubRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authSubRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authSubRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler) // Assuming this is meant for refresh tokens

	// Apply CSRF middleware to the auth sub-router
	// Pass the CSRF key from config if the middleware needs it (e.g., for gorilla/csrf)
	// For the current custom middleware, the key is not directly used in its validation logic.
	apiRouter.Handle("/auth/", http.StripPrefix("/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authSubRouter)))

	// Authenticated API Routes (apply AuthMiddleware first, then CSRFMiddleware)
	// The CSRF token is typically validated before authentication for mutating requests.
	csrfAuthMw := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)

	apiRouter.Handle("POST /upload", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleUpload))))
	apiRouter.Handle("GET /transactions/processed", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetProcessedTransactions))))
	apiRouter.Handle("GET /holdings/stocks", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetStockHoldings))))
	apiRouter.Handle("GET /holdings/options", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetOptionHoldings))))
	apiRouter.Handle("GET /stock-sales", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetStockSales))))
	apiRouter.Handle("GET /option-sales", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetOptionSales))))
	apiRouter.Handle("GET /dividend-tax-summary", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTaxSummary))))
	apiRouter.Handle("GET /dividend-transactions", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDividendTransactions))))
	apiRouter.Handle("POST /logout", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(userHandler.LogoutUserHandler))))
	apiRouter.Handle("GET /dashboard-data", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDashboardData))))

	rootMux.Handle("/api/", http.StripPrefix("/api", apiRouter))

	// 8. Apply Global Middleware & Start Server
	logger.L.Info("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux))

	serverAddr := ":" + config.Cfg.Port
	logger.L.Info("Server configured successfully.", "address", serverAddr)

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
		stdlog.Fatalf("Failed to start server: %v", err) // Use stdlog for fatal error at this stage
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	} else {
		logger.L.Info("Server stopped.")
	}
}
