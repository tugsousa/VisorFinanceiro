// backend/main.go
package main

import (
	"crypto/tls"
	"encoding/json"
	stdlog "log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	"github.com/username/taxfolio/backend/src/logger"
	_ "github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
	"golang.org/x/time/rate"
)

// proxyHeadersMiddleware inspects proxy headers to determine if the original
// request was HTTPS, and updates the request object accordingly. This is crucial
// for security features (like Secure cookies) to work correctly behind a reverse proxy.
func proxyHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Forwarded-Proto") == "https" {
			r.URL.Scheme = "https"
			r.TLS = &tls.ConnectionState{}
		}
		next.ServeHTTP(w, r)
	})
}

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
			"https://rumoclaro.pt":  true,
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
	logger.L.Info("RumoClaro backend server starting...")

	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("JWT_SECRET configuration invalid. Must be at least 32 bytes.")
		os.Exit(1)
	}
	if len(config.Cfg.CSRFAuthKey) < 32 {
		logger.L.Error("CSRF_AUTH_KEY must be at least 32 bytes long.")
		os.Exit(1)
	}

	logger.L.Info("Initializing data loaders...")
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
	}

	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	database.RunMigrations(config.Cfg.DatabasePath)
	logger.L.Info("Database initialized successfully.")

	logger.L.Info("Initializing report cache...")
	reportCache := cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval)
	logger.L.Info("Report cache initialized.")

	logger.L.Info("Initializing services and handlers...")
	handlers.InitializeGoogleOAuthConfig()
	authService := security.NewAuthService(config.Cfg.JWTSecret)
	emailService := services.NewEmailService()
	userHandler := handlers.NewUserHandler(authService, emailService)

	// Instantiate the new price service
	priceService := services.NewPriceService()

	transactionProcessor := processors.NewTransactionProcessor()
	dividendProcessor := processors.NewDividendProcessor()
	stockProcessor := processors.NewStockProcessor()
	optionProcessor := processors.NewOptionProcessor()
	cashMovementProcessor := processors.NewCashMovementProcessor()
	feeProcessor := processors.NewFeeProcessor()

	uploadService := services.NewUploadService(
		transactionProcessor,
		dividendProcessor,
		stockProcessor,
		optionProcessor,
		cashMovementProcessor,
		feeProcessor,
		reportCache,
	)

	uploadHandler := handlers.NewUploadHandler(uploadService)
	// Pass both services to the PortfolioHandler constructor
	portfolioHandler := handlers.NewPortfolioHandler(uploadService, priceService)
	dividendHandler := handlers.NewDividendHandler(uploadService)
	txHandler := handlers.NewTransactionHandler(uploadService)
	feeHandler := handlers.NewFeeHandler(uploadService)

	logger.L.Info("Configuring routes...")
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.Recoverer)
	r.Use(proxyHeadersMiddleware)
	r.Use(enableCORS)
	r.Use(rateLimitMiddleware)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "RumoClaro Backend is running"})
	})

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Public auth routes
		r.Group(func(r chi.Router) {
			r.Get("/auth/csrf", handlers.GetCSRFToken)
			r.Get("/auth/verify-email", userHandler.VerifyEmailHandler)
			r.Get("/auth/google/login", userHandler.HandleGoogleLogin)
			r.Get("/auth/google/callback", userHandler.HandleGoogleCallback)
		})

		// Auth actions with CSRF protection
		r.Group(func(r chi.Router) {
			r.Use(handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey))
			r.Post("/auth/login", userHandler.LoginUserHandler)
			r.Post("/auth/register", userHandler.RegisterUserHandler)
			r.Post("/auth/refresh", userHandler.RefreshTokenHandler)
			r.With(userHandler.AuthMiddleware).Post("/auth/logout", userHandler.LogoutUserHandler)
			r.Post("/auth/request-password-reset", userHandler.RequestPasswordResetHandler)
			r.Post("/auth/reset-password", userHandler.ResetPasswordHandler)
		})

		// Protected API routes with CSRF and Auth
		r.Group(func(r chi.Router) {
			r.Use(handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey))
			r.Use(userHandler.AuthMiddleware)

			r.Post("/upload", uploadHandler.HandleUpload)
			r.Get("/realizedgains-data", uploadHandler.HandleGetRealizedGainsData)
			r.Get("/transactions/processed", txHandler.HandleGetProcessedTransactions)
			r.Get("/holdings/current-value", portfolioHandler.HandleGetCurrentHoldingsValue)
			r.Get("/holdings/stocks", portfolioHandler.HandleGetStockHoldings)
			r.Get("/holdings/options", portfolioHandler.HandleGetOptionHoldings)
			r.Get("/stock-sales", portfolioHandler.HandleGetStockSales)
			r.Get("/option-sales", portfolioHandler.HandleGetOptionSales)
			r.Get("/dividend-tax-summary", dividendHandler.HandleGetDividendTaxSummary)
			r.Get("/dividend-transactions", dividendHandler.HandleGetDividendTransactions)
			r.Get("/fees", feeHandler.HandleGetFeeDetails)
			r.Delete("/transactions/all", txHandler.HandleDeleteAllProcessedTransactions)
			r.Get("/user/has-data", userHandler.HandleCheckUserData)
			r.Post("/user/change-password", userHandler.ChangePasswordHandler)
			r.Post("/user/delete-account", userHandler.DeleteAccountHandler)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			logger.L.Warn("Root level path not found", "method", r.Method, "path", r.URL.Path)
			http.NotFound(w, r)
		}
	})

	serverAddr := ":" + config.Cfg.Port
	server := &http.Server{
		Addr:         serverAddr,
		Handler:      r,
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
