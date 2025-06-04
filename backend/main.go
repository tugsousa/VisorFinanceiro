package main

import (
	"encoding/json"
	stdlog "log" // Standard log for initial messages
	"net/http"
	"os" // Import os package for Exit
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
		allowedOrigins := map[string]bool{
			"http://localhost:3000": true,
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie, If-None-Match")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token, ETag")
		} else if origin == "" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
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
	logger.InitLogger(config.Cfg.LogLevel)
	logger.L.Info("Taxfolio backend server starting...")

	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("JWT_SECRET configuration invalid. Must be at least 32 bytes.")
		os.Exit(1) // Exit for fatal configuration error
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("CSRF_AUTH_KEY must be at least 32 bytes long.")
		os.Exit(1) // Exit for fatal configuration error
	}

	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		logger.L.Error("Failed to load historical rates", "error", err)
		// Depending on severity, you might os.Exit(1) here too if rates are critical for startup
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
		// Depending on severity, you might os.Exit(1) here too
	}

	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	logger.L.Info("Initializing report cache...")
	reportCache := cache.New(15*time.Minute, 30*time.Minute)
	logger.L.Info("Report cache initialized.")

	logger.L.Info("Initializing services and handlers...")
	authService := security.NewAuthService(config.Cfg.JWTSecret)
	// Ensure you have an EmailService implementation (e.g., SMTPEmailService or MockEmailService)
	// For this example, assuming SMTPEmailService is correctly defined in services package.
	emailService := services.NewEmailService()
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
	txHandler := handlers.NewTransactionHandler()

	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()
	apiRouter := http.NewServeMux()

	apiRouter.HandleFunc("GET /api/auth/csrf", handlers.GetCSRFToken)
	apiRouter.HandleFunc("GET /api/auth/verify-email", userHandler.VerifyEmailHandler)

	authActionRouter := http.NewServeMux()
	authActionRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authActionRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authActionRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler)
	authActionRouter.HandleFunc("POST /logout", userHandler.AuthMiddleware(userHandler.LogoutUserHandler))

	apiRouter.Handle("/api/auth/", http.StripPrefix("/api/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authActionRouter)))

	csrfProtection := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)
	applyCsrfAndAuth := func(handler http.HandlerFunc) http.Handler {
		return csrfProtection(http.HandlerFunc(userHandler.AuthMiddleware(handler)))
	}

	apiRouter.Handle("POST /api/upload", applyCsrfAndAuth(uploadHandler.HandleUpload))
	apiRouter.Handle("GET /api/realizedgains-data", applyCsrfAndAuth(uploadHandler.HandleGetRealizedGainsData))
	apiRouter.Handle("GET /api/transactions/processed", applyCsrfAndAuth(txHandler.HandleGetProcessedTransactions))
	apiRouter.Handle("GET /api/holdings/stocks", applyCsrfAndAuth(portfolioHandler.HandleGetStockHoldings))
	apiRouter.Handle("GET /api/holdings/options", applyCsrfAndAuth(portfolioHandler.HandleGetOptionHoldings))
	apiRouter.Handle("GET /api/stock-sales", applyCsrfAndAuth(portfolioHandler.HandleGetStockSales))
	apiRouter.Handle("GET /api/option-sales", applyCsrfAndAuth(portfolioHandler.HandleGetOptionSales))
	apiRouter.Handle("GET /api/dividend-tax-summary", applyCsrfAndAuth(dividendHandler.HandleGetDividendTaxSummary))
	apiRouter.Handle("GET /api/dividend-transactions", applyCsrfAndAuth(dividendHandler.HandleGetDividendTransactions))
	apiRouter.Handle("GET /api/user/has-data", applyCsrfAndAuth(userHandler.HandleCheckUserData))

	rootMux.Handle("/api/", apiRouter)

	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
		} else {
			if !strings.HasPrefix(r.URL.Path, "/api/") {
				logger.L.Warn("Root level path not found", "method", r.Method, "path", r.URL.Path)
				http.NotFound(w, r)
			}
		}
	})

	logger.L.Info("Applying global middleware...")
	finalHandler := enableCORS(rateLimitMiddleware(rootMux))

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
		stdlog.Fatalf("Failed to start server: %v", err) // stdlog.Fatalf is fine here as it's a true panic point
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	}
}
