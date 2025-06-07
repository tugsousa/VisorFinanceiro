package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type AppConfig struct {
	JWTSecret          string
	Port               string
	DatabasePath       string
	LogLevel           string
	CSRFAuthKey        []byte
	HistoricalDataPath string
	CountryDataPath    string
	AccessTokenExpiry  time.Duration
	RefreshTokenExpiry time.Duration
	MaxUploadSizeBytes int64

	EmailServiceProvider string

	SMTPServer   string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string

	MailgunDomain        string
	MailgunPrivateAPIKey string

	SenderEmail string
	SenderName  string

	VerificationEmailBaseURL string
	VerificationTokenExpiry  time.Duration

	// New fields for password reset
	PasswordResetBaseURL     string        // e.g., http://localhost:3000/reset-password
	PasswordResetTokenExpiry time.Duration // e.g., 1h
}

var Cfg *AppConfig

func LoadConfig() {
	errEnv := godotenv.Load()
	if errEnv != nil {
		log.Println("Info: No .env file found or error loading .env file. Relying on OS environment variables and defaults. Error (if any):", errEnv)
	} else {
		log.Println(".env file loaded successfully.")
	}

	log.Println("Loading application configuration...")

	jwtSecret := getEnv("JWT_SECRET", "your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes")
	if jwtSecret == "your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes" {
		log.Println("WARNING: Using default insecure JWT_SECRET. Set JWT_SECRET environment variable for production.")
	}

	csrfAuthKeyStr := getEnv("CSRF_AUTH_KEY", "a-very-secure-32-byte-long-key-must-be-32-bytes!")
	if csrfAuthKeyStr == "a-very-secure-32-byte-long-key-must-be-32-bytes!" {
		log.Println("WARNING: Using default insecure CSRF_AUTH_KEY. Set CSRF_AUTH_KEY environment variable for production.")
	}
	if len(csrfAuthKeyStr) < 32 {
		log.Fatalf("FATAL: CSRF_AUTH_KEY must be at least 32 bytes long. Current length: %d", len(csrfAuthKeyStr))
	}

	accessTokenExpiryStr := getEnv("ACCESS_TOKEN_EXPIRY", "60m")
	refreshTokenExpiryStr := getEnv("REFRESH_TOKEN_EXPIRY", "168h")
	accessTokenExpiry, err := time.ParseDuration(accessTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid ACCESS_TOKEN_EXPIRY format '%s'. Using default 60m. Error: %v", accessTokenExpiryStr, err)
		accessTokenExpiry = 60 * time.Minute
	}
	refreshTokenExpiry, err := time.ParseDuration(refreshTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid REFRESH_TOKEN_EXPIRY format '%s'. Using default 7d (168h). Error: %v", refreshTokenExpiryStr, err)
		refreshTokenExpiry = 7 * 24 * time.Hour
	}

	maxUploadSizeBytesStr := getEnv("MAX_UPLOAD_SIZE_BYTES", "10485760")
	maxUploadSizeBytes, err := strconv.ParseInt(maxUploadSizeBytesStr, 10, 64)
	if err != nil {
		log.Printf("WARNING: Invalid MAX_UPLOAD_SIZE_BYTES format '%s'. Using default 10MB. Error: %v", maxUploadSizeBytesStr, err)
		maxUploadSizeBytes = 10 * 1024 * 1024
	}

	verificationTokenExpiryStr := getEnv("VERIFICATION_TOKEN_EXPIRY", "24h")
	verificationTokenExpiry, err := time.ParseDuration(verificationTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid VERIFICATION_TOKEN_EXPIRY format '%s'. Using default 24h. Error: %v", verificationTokenExpiryStr, err)
		verificationTokenExpiry = 24 * time.Hour
	}

	// New Password Reset Config
	passwordResetTokenExpiryStr := getEnv("PASSWORD_RESET_TOKEN_EXPIRY", "1h")
	passwordResetTokenExpiry, err := time.ParseDuration(passwordResetTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid PASSWORD_RESET_TOKEN_EXPIRY format '%s'. Using default 1h. Error: %v", passwordResetTokenExpiryStr, err)
		passwordResetTokenExpiry = 1 * time.Hour
	}

	Cfg = &AppConfig{
		JWTSecret:          jwtSecret,
		Port:               getEnv("PORT", "8080"),
		DatabasePath:       getEnv("DATABASE_PATH", "./taxfolio.db"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		CSRFAuthKey:        []byte(csrfAuthKeyStr),
		HistoricalDataPath: getEnv("HISTORICAL_DATA_PATH", "data/historicalExchangeRate.json"),
		CountryDataPath:    getEnv("COUNTRY_DATA_PATH", "data/country.json"),
		AccessTokenExpiry:  accessTokenExpiry,
		RefreshTokenExpiry: refreshTokenExpiry,
		MaxUploadSizeBytes: maxUploadSizeBytes,

		EmailServiceProvider: getEnv("EMAIL_SERVICE_PROVIDER", "mailgun"),

		SMTPServer:   getEnv("SMTP_SERVER", ""),
		SMTPPort:     getEnvAsInt("SMTP_PORT", 587),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),

		MailgunDomain:        getEnv("MAILGUN_DOMAIN", ""),
		MailgunPrivateAPIKey: getEnv("MAILGUN_PRIVATE_API_KEY", ""),

		SenderEmail: getEnv("SENDER_EMAIL", "noreply@example.com"),
		SenderName:  getEnv("SENDER_NAME", "Taxfolio App"),

		VerificationEmailBaseURL: getEnv("VERIFICATION_EMAIL_BASE_URL", "http://localhost:3000/verify-email"),
		VerificationTokenExpiry:  verificationTokenExpiry,

		// New fields for password reset
		PasswordResetBaseURL:     getEnv("PASSWORD_RESET_BASE_URL", "http://localhost:3000/reset-password"),
		PasswordResetTokenExpiry: passwordResetTokenExpiry,
	}

	if Cfg.EmailServiceProvider == "mailgun" {
		if Cfg.MailgunDomain == "" {
			log.Fatalf("FATAL: MAILGUN_DOMAIN is required when EMAIL_SERVICE_PROVIDER is 'mailgun', but it's not set in environment or .env file.")
		}
		if Cfg.MailgunPrivateAPIKey == "" {
			log.Fatalf("FATAL: MAILGUN_PRIVATE_API_KEY is required when EMAIL_SERVICE_PROVIDER is 'mailgun', but it's not set in environment or .env file.")
		}
		if Cfg.SenderEmail == "noreply@example.com" || Cfg.SenderEmail == "" {
			log.Fatalf("FATAL: SENDER_EMAIL must be configured properly (e.g., your Mailgun sender) when EMAIL_SERVICE_PROVIDER is 'mailgun'.")
		}
	}

	log.Printf("Configuration loaded: Port=%s, LogLevel=%s, DBPath=%s, EmailProvider=%s",
		Cfg.Port, Cfg.LogLevel, Cfg.DatabasePath, Cfg.EmailServiceProvider)
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	log.Printf("Environment variable %s not set, using default: %s", key, fallback)
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		log.Printf("Integer value for %s not set or empty, using default: %d", key, fallback)
		return fallback
	}
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid integer value for %s ('%s'), using default: %d", key, valueStr, fallback)
	return fallback
}

func getEnvAsDuration(key string, fallback time.Duration) time.Duration {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		log.Printf("Duration value for %s not set or empty, using default: %s", key, fallback.String())
		return fallback
	}
	if value, err := time.ParseDuration(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid duration value for %s ('%s'), using default: %s", key, valueStr, fallback.String())
	return fallback
}
