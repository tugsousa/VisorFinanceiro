package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// AppConfig holds all configuration for the application.
// The values are loaded from environment variables.
type AppConfig struct {
	// Core settings
	Port         string
	DatabasePath string
	LogLevel     string

	// Security settings
	JWTSecret          string
	CSRFAuthKey        []byte
	OAuthStateString   string
	AccessTokenExpiry  time.Duration
	RefreshTokenExpiry time.Duration
	MaxUploadSizeBytes int64

	// Data file paths
	CountryDataPath string

	// Email Service settings
	EmailServiceProvider string
	SenderEmail          string
	SenderName           string

	// SMTP specific settings
	SMTPServer   string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string

	// URL and Token Expiry settings for user actions
	VerificationEmailBaseURL string
	VerificationTokenExpiry  time.Duration
	PasswordResetBaseURL     string
	PasswordResetTokenExpiry time.Duration

	// Google OAuth settings
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string

	// Frontend URL for reference (e.g., CORS, redirects)
	FrontendBaseURL string

	// Admin Users
	AdminEmails []string
}

// Cfg is a global instance of the AppConfig.
var Cfg *AppConfig

// LoadConfig loads configuration from environment variables or a .env file.
// It centralizes all configuration logic for the application.
func LoadConfig() {
	// 1. Try loading from the current directory (standard behavior)
	errEnv := godotenv.Load()

	// 2. If not found, try loading from the parent directory (common when running from /backend)
	if errEnv != nil {
		errEnv = godotenv.Load("../.env")
	}

	if errEnv != nil {
		if os.IsNotExist(errEnv) {
			log.Println("Info: No .env file found in current or parent directory. Relying on OS environment variables (expected in production).")
		} else {
			log.Printf("Warning: Error loading .env file: %v. Relying on OS environment variables.", errEnv)
		}
	} else {
		log.Println(".env file loaded successfully.")
	}

	log.Println("Loading application configuration...")

	// --- Security & Tokens (Secrets) ---
	jwtSecret := getRequiredEnv("JWT_SECRET")
	csrfAuthKeyStr := getRequiredEnv("CSRF_AUTH_KEY")

	oauthStateString := getEnv("OAUTH_STATE_STRING", "secure-random-state-string-for-dev-only")
	if oauthStateString == "secure-random-state-string-for-dev-only" {
		log.Println("WARNING: Using default OAUTH_STATE_STRING. Set this in production.")
	}

	// --- Token Expiry Durations ---
	accessTokenExpiry := getEnvAsDuration("ACCESS_TOKEN_EXPIRY", 60*time.Minute)
	refreshTokenExpiry := getEnvAsDuration("REFRESH_TOKEN_EXPIRY", 168*time.Hour) // 7 days
	verificationTokenExpiry := getEnvAsDuration("VERIFICATION_TOKEN_EXPIRY", 24*time.Hour)
	passwordResetTokenExpiry := getEnvAsDuration("PASSWORD_RESET_TOKEN_EXPIRY", 1*time.Hour)

	// --- File Size Limits ---
	maxUploadSizeBytesStr := getEnv("MAX_UPLOAD_SIZE_BYTES", "10485760") // 10MB default
	maxUploadSizeBytes, err := strconv.ParseInt(maxUploadSizeBytesStr, 10, 64)
	if err != nil {
		log.Printf("WARNING: Invalid MAX_UPLOAD_SIZE_BYTES format '%s'. Using default 10MB. Error: %v", maxUploadSizeBytesStr, err)
		maxUploadSizeBytes = 10 * 1024 * 1024
	}

	// --- URL Derivation Logic ---
	frontendBaseURL := getEnv("APP_BASE_URL", "http://localhost:3000")
	apiBaseURL := getEnv("REACT_APP_API_BASE_URL", "http://localhost:8080")

	// Derive specific URLs from the base URLs.
	verificationEmailBaseURL := getEnv("VERIFICATION_EMAIL_BASE_URL", frontendBaseURL+"/verify-email")
	passwordResetBaseURL := getEnv("PASSWORD_RESET_BASE_URL", frontendBaseURL+"/reset-password")
	googleRedirectURL := getEnv("GOOGLE_REDIRECT_URL", apiBaseURL+"/api/auth/google/callback")

	// --- Populate the Global Config Struct ---
	Cfg = &AppConfig{
		// Core
		Port:         getEnv("PORT", "8080"),
		DatabasePath: getEnv("DATABASE_PATH", "./visorfinanceiro.db"),
		LogLevel:     getEnv("LOG_LEVEL", "info"),

		// Security
		JWTSecret:          jwtSecret,
		CSRFAuthKey:        []byte(csrfAuthKeyStr),
		OAuthStateString:   oauthStateString,
		AccessTokenExpiry:  accessTokenExpiry,
		RefreshTokenExpiry: refreshTokenExpiry,
		MaxUploadSizeBytes: maxUploadSizeBytes,

		// Data
		CountryDataPath: getEnv("COUNTRY_DATA_PATH", "data/country.json"),

		// Email
		EmailServiceProvider: getEnv("EMAIL_SERVICE_PROVIDER", "smtp"),
		SenderEmail:          getEnv("SENDER_EMAIL", "noreply@example.com"),
		SenderName:           getEnv("SENDER_NAME", "VisorFinanceiro"),
		SMTPServer:           getEnv("SMTP_SERVER", ""),
		SMTPPort:             getEnvAsInt("SMTP_PORT", 587),
		SMTPUser:             getEnv("SMTP_USER", ""),
		SMTPPassword:         getEnv("SMTP_PASSWORD", ""),

		// URLs & Expiries
		FrontendBaseURL:          frontendBaseURL,
		VerificationEmailBaseURL: verificationEmailBaseURL,
		VerificationTokenExpiry:  verificationTokenExpiry,
		PasswordResetBaseURL:     passwordResetBaseURL,
		PasswordResetTokenExpiry: passwordResetTokenExpiry,

		// Google OAuth
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  googleRedirectURL,

		// Admin Users
		AdminEmails: getAdminEmails("ADMIN_EMAILS"),
	}

	log.Printf("Configuration loaded: Port=%s, LogLevel=%s, DBPath=%s, FrontendURL=%s",
		Cfg.Port, Cfg.LogLevel, Cfg.DatabasePath, Cfg.FrontendBaseURL)
	log.Printf("Admin emails loaded: %d", len(Cfg.AdminEmails))
}

// getEnv retrieves an environment variable or returns a fallback value.
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	log.Printf("Environment variable %s not set, using default: %s", key, fallback)
	return fallback
}

// getRequiredEnv retrieves an environment variable or terminates the application if not set.
func getRequiredEnv(key string) string {
	value, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(value) == "" {
		log.Fatalf("FATAL: Required environment variable %s is not set or is empty. Application cannot start securely.", key)
	}
	return value
}

// getEnvAsInt retrieves an environment variable as an integer or returns a fallback.
func getEnvAsInt(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return fallback
	}
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid integer value for %s ('%s'), using default: %d", key, valueStr, fallback)
	return fallback
}

// getEnvAsDuration retrieves an environment variable as a time.Duration or returns a fallback.
func getEnvAsDuration(key string, fallback time.Duration) time.Duration {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return fallback
	}
	if value, err := time.ParseDuration(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid duration value for %s ('%s'), using default: %s", key, valueStr, fallback.String())
	return fallback
}

// getAdminEmails retrieves and parses the comma-separated list of admin emails.
func getAdminEmails(key string) []string {
	emailsStr := getEnv(key, "")
	if emailsStr == "" {
		return []string{}
	}
	emails := strings.Split(emailsStr, ",")
	for i, email := range emails {
		emails[i] = strings.TrimSpace(email)
	}
	return emails
}
