package main

import (
	"encoding/json"
	stdlog "log" // Standard log for fatal errors before logger is fully up
	"net/http"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger"
	_ "github.com/username/taxfolio/backend/src/model" // Ensure model package (now split into files) is implicitly used
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
		if origin == "http://localhost:3000" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
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
	config.LoadConfig()
	logger.InitLogger(config.Cfg.LogLevel)
	logger.L.Info("Taxfolio backend server starting...")

	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("FATAL: JWT_SECRET configuration invalid.")
		stdlog.Fatal("JWT_SECRET is not configured correctly.")
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("FATAL: CSRF_AUTH_KEY must be at least 32 bytes long.")
		stdlog.Fatal("CSRF_AUTH_KEY is too short.")
	}

	logger.L.Info("Initializing data loaders...")
	if err := processors.LoadHistoricalRates(config.Cfg.HistoricalDataPath); err != nil {
		stdlog.Fatalf("Failed to load historical rates: %v", err)
	}
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		stdlog.Fatalf("Failed to load country data: %v", err)
	}

	logger.L.Info("Initializing database...")
	database.InitDB(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

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
	portfolioHandler := handlers.NewPortfolioHandler(uploadService) // New handler
	dividendHandler := handlers.NewDividendHandler(uploadService)   // New handler
	txHandler := handlers.NewTransactionHandler()                   // New handler

	logger.L.Info("Configuring routes...")
	rootMux := http.NewServeMux()
	rootMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"message": "TAXFOLIO Backend is running"})
		} else if r.URL.Path == "/" && r.Method != http.MethodGet {
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		} else {
			http.NotFound(w, r)
		}
	})

	apiRouter := http.NewServeMux()
	authSubRouter := http.NewServeMux()
	authSubRouter.HandleFunc("GET /csrf", handlers.GetCSRFToken)
	authSubRouter.HandleFunc("POST /login", userHandler.LoginUserHandler)
	authSubRouter.HandleFunc("POST /register", userHandler.RegisterUserHandler)
	authSubRouter.HandleFunc("POST /refresh", userHandler.RefreshTokenHandler)
	apiRouter.Handle("/auth/", http.StripPrefix("/auth", handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)(authSubRouter)))

	csrfAuthMw := handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey)

	// Upload routes
	apiRouter.Handle("POST /upload", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleUpload))))
	apiRouter.Handle("GET /dashboard-data", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(uploadHandler.HandleGetDashboardData))))

	// Transaction routes
	apiRouter.Handle("GET /transactions/processed", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(txHandler.HandleGetProcessedTransactions))))

	// Portfolio routes
	apiRouter.Handle("GET /holdings/stocks", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(portfolioHandler.HandleGetStockHoldings))))
	apiRouter.Handle("GET /holdings/options", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(portfolioHandler.HandleGetOptionHoldings))))
	apiRouter.Handle("GET /stock-sales", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(portfolioHandler.HandleGetStockSales))))
	apiRouter.Handle("GET /option-sales", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(portfolioHandler.HandleGetOptionSales))))

	// Dividend routes
	apiRouter.Handle("GET /dividend-tax-summary", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(dividendHandler.HandleGetDividendTaxSummary))))
	apiRouter.Handle("GET /dividend-transactions", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(dividendHandler.HandleGetDividendTransactions))))

	// Auth related (logout is authenticated)
	apiRouter.Handle("POST /logout", csrfAuthMw(http.HandlerFunc(userHandler.AuthMiddleware(userHandler.LogoutUserHandler))))

	rootMux.Handle("/api/", http.StripPrefix("/api", apiRouter))

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
		stdlog.Fatalf("Failed to start server: %v", err)
	} else if err == http.ErrServerClosed {
		logger.L.Info("Server stopped gracefully.")
	}
}
