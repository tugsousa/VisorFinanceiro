package main

import (
	"crypto/tls"
	"encoding/json"
	stdlog "log"
	"net/http"
	"os"
	"strings"
	"sync"
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

func proxyHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Forwarded-Proto") == "https" {
			r.URL.Scheme = "https"
			r.TLS = &tls.ConnectionState{}
		}
		next.ServeHTTP(w, r)
	})
}

// IPRateLimiter manages a separate rate limiter for each IP address.
type IPRateLimiter struct {
	ips map[string]*rate.Limiter
	mu  sync.RWMutex
	r   rate.Limit
	b   int
}

// NewIPRateLimiter creates a custom rate limiter instance.
func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	i := &IPRateLimiter{
		ips: make(map[string]*rate.Limiter),
		r:   r,
		b:   b,
	}

	// Launch a background goroutine to clean up old entries every 10 minutes
	// to prevent memory leaks from one-off visitors.
	go i.cleanupLoop()

	return i
}

// GetLimiter returns the rate limiter for the provided IP address.
func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.Lock()
	defer i.mu.Unlock()

	limiter, exists := i.ips[ip]
	if !exists {
		limiter = rate.NewLimiter(i.r, i.b)
		i.ips[ip] = limiter
	}

	return limiter
}

// cleanupLoop periodically clears the map to remove stale IPs.
// In a more complex app, you might check 'last seen' timestamps, but a full reset is safe here
// as active users will simply get a fresh bucket.
func (i *IPRateLimiter) cleanupLoop() {
	for {
		time.Sleep(10 * time.Minute)
		i.mu.Lock()
		i.ips = make(map[string]*rate.Limiter)
		i.mu.Unlock()
	}
}

// Global instance: 5 requests per second (r), burst of 10 (b) per IP.
// Adjust these values based on your frontend's needs.
var ipLimiter = NewIPRateLimiter(rate.Every(200*time.Millisecond), 10)

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Determine the client IP.
		ip := r.RemoteAddr
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			// Get the last IP in the list
			ip = strings.TrimSpace(parts[len(parts)-1])
		}

		limiter := ipLimiter.GetLimiter(ip)
		if !limiter.Allow() {
			http.Error(w, http.StatusText(http.StatusTooManyRequests), http.StatusTooManyRequests)
			logger.L.Warn("Rate limit exceeded", "ip", ip, "path", r.URL.Path)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Define your allowlist explicitly.
		allowedOrigins := map[string]bool{
			"http://localhost:3000":          true,
			"https://visorfinanceiro.pt":     true,
			"https://www.visorfinanceiro.pt": true,
		}

		// Only set CORS headers if the origin is explicitly allowed.
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie, If-None-Match")
			w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token, ETag")
		}

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	config.LoadConfig()
	logger.InitLogger(config.Cfg.LogLevel)

	logger.L.Info("VisorFinanceiro backend server starting...")

	if config.Cfg.JWTSecret == "" || len(config.Cfg.JWTSecret) < 32 {
		logger.L.Error("JWT_SECRET configuration invalid.")
		os.Exit(1)
	}

	logger.L.Info("Initializing data loaders...")
	if err := utils.InitCountryData(config.Cfg.CountryDataPath); err != nil {
		logger.L.Error("Failed to load country data", "error", err)
	}

	logger.L.Info("Initializing database...", "path", config.Cfg.DatabasePath)
	database.InitDB(config.Cfg.DatabasePath)
	database.RunMigrations(config.Cfg.DatabasePath)

	reportCache := cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval)

	handlers.InitializeGoogleOAuthConfig()

	authService := security.NewAuthService(config.Cfg.JWTSecret)
	emailService := services.NewEmailService()
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
		priceService,
		reportCache,
	)

	userHandler := handlers.NewUserHandler(authService, emailService, uploadService, reportCache)
	uploadHandler := handlers.NewUploadHandler(uploadService)
	portfolioHandler := handlers.NewPortfolioHandler(uploadService, priceService)
	dividendHandler := handlers.NewDividendHandler(uploadService)
	txHandler := handlers.NewTransactionHandler(uploadService)
	feeHandler := handlers.NewFeeHandler(uploadService)
	pfManagerHandler := handlers.NewPortfolioManagerHandler()

	r := chi.NewRouter()

	r.Use(middleware.Recoverer)
	r.Use(handlers.ContextualLoggerMiddleware)
	r.Use(proxyHeadersMiddleware)
	r.Use(enableCORS)
	r.Use(rateLimitMiddleware)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "VisorFinanceiro Backend is running"})
	})

	r.Route("/api", func(r chi.Router) {
		// Rotas Públicas
		r.Group(func(r chi.Router) {
			r.Get("/auth/csrf", handlers.GetCSRFToken)
			r.Get("/auth/verify-email", userHandler.VerifyEmailHandler)
			r.Get("/auth/google/login", userHandler.HandleGoogleLogin)
			r.Get("/auth/google/callback", userHandler.HandleGoogleCallback)
		})

		// Rotas de Autenticação (Protegidas por CSRF)
		r.Group(func(r chi.Router) {
			r.Use(handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey))
			r.Post("/auth/login", userHandler.LoginUserHandler)
			r.Post("/auth/register", userHandler.RegisterUserHandler)
			r.Post("/auth/refresh", userHandler.RefreshTokenHandler)
			r.With(userHandler.AuthMiddleware).Post("/auth/logout", userHandler.LogoutUserHandler)
			r.Post("/auth/request-password-reset", userHandler.RequestPasswordResetHandler)
			r.Post("/auth/reset-password", userHandler.ResetPasswordHandler)
		})

		// Rotas Protegidas (Requerem Autenticação e CSRF)
		r.Group(func(r chi.Router) {
			r.Use(handlers.CSRFMiddleware(config.Cfg.CSRFAuthKey))
			r.Use(userHandler.AuthMiddleware)

			r.Get("/portfolios", pfManagerHandler.ListPortfolios)
			r.Post("/portfolios", pfManagerHandler.CreatePortfolio)
			r.Delete("/portfolios/{id}", pfManagerHandler.DeletePortfolio)
			r.Post("/portfolios/{id}/refresh-snapshot", portfolioHandler.HandleRefreshSnapshot)

			r.Post("/upload", uploadHandler.HandleUpload)
			r.Get("/realizedgains-data", uploadHandler.HandleGetRealizedGainsData)
			r.Get("/transactions/processed", txHandler.HandleGetProcessedTransactions)
			r.Post("/transactions/manual", txHandler.HandleAddManualTransaction)
			r.Get("/holdings/current-value", portfolioHandler.HandleGetCurrentHoldingsValue)
			r.Get("/holdings/stocks", portfolioHandler.HandleGetStockHoldings)
			r.Get("/holdings/options", portfolioHandler.HandleGetOptionHoldings)
			r.Get("/stock-sales", portfolioHandler.HandleGetStockSales)
			r.Get("/option-sales", portfolioHandler.HandleGetOptionSales)
			r.Get("/dividend-tax-summary", dividendHandler.HandleGetDividendTaxSummary)
			r.Get("/dividend-transactions", dividendHandler.HandleGetDividendTransactions)
			r.Get("/dividend-metrics", dividendHandler.HandleGetDividendMetrics)
			r.Get("/fees", feeHandler.HandleGetFeeDetails)
			r.Delete("/transactions/all", txHandler.HandleDeleteAllProcessedTransactions)
			r.Get("/user/has-data", userHandler.HandleCheckUserData)
			r.Post("/user/change-password", userHandler.ChangePasswordHandler)
			r.Post("/user/delete-account", userHandler.DeleteAccountHandler)
			r.Get("/history/chart", portfolioHandler.HandleGetHistoricalChartData)

			// Rotas de Administração
			r.Group(func(r chi.Router) {
				r.Use(userHandler.AdminMiddleware)
				r.Get("/admin/stats", userHandler.HandleGetAdminStats)
				r.Get("/admin/users", userHandler.HandleGetAdminUsers)
				r.Post("/admin/users/{userID}/refresh-metrics", userHandler.HandleAdminRefreshUserMetrics)
				r.Get("/admin/users/{userID}", userHandler.HandleGetAdminUserDetails)
				r.Post("/admin/users/refresh-metrics-batch", userHandler.HandleAdminRefreshMultipleUserMetrics)
				r.Post("/admin/stats/clear-cache", userHandler.HandleAdminClearStatsCache)

				r.Post("/admin/mfa/setup", userHandler.HandleSetupMFA)
				r.Post("/admin/mfa/activate", userHandler.HandleActivateMFA)
				r.Post("/admin/mfa/disable", userHandler.HandleDisableMFA)

				// Impersonation protegida
				r.Post("/admin/users/{userID}/impersonate", userHandler.HandleImpersonateUser)
			})
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
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
		stdlog.Fatalf("Failed to start server: %v", err)
	}
}
