package config

import (
	"log" // Standard log for initial config loading messages
	"os"
	"strconv"
	"time"
)

// AppConfig holds all application configuration.
type AppConfig struct {
	JWTSecret          string
	Port               string
	DatabasePath       string
	LogLevel           string
	CSRFAuthKey        []byte
	HistoricalDataPath string
	CountryDataPath    string
	AccessTokenExpiry  time.Duration // New
	RefreshTokenExpiry time.Duration // New
}

var Cfg *AppConfig

// LoadConfig loads configuration from environment variables.
// It should be called once at application startup.
func LoadConfig() {
	// Standard library log for bootstrap messages before logger is initialized
	log.Println("Loading application configuration...")

	jwtSecret := getEnv("JWT_SECRET", "your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes")
	if jwtSecret == "your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes" {
		log.Println("WARNING: Using default insecure JWT_SECRET. Set JWT_SECRET environment variable for production.")
	}
	// Length check will be in main.go after config is loaded

	csrfAuthKeyStr := getEnv("CSRF_AUTH_KEY", "a-very-secure-32-byte-long-key-must-be-32-bytes!") // Ensure 32 bytes
	if csrfAuthKeyStr == "a-very-secure-32-byte-long-key-must-be-32-bytes!" {
		log.Println("WARNING: Using default insecure CSRF_AUTH_KEY. Set CSRF_AUTH_KEY environment variable for production.")
	}
	if len(csrfAuthKeyStr) < 32 {
		log.Fatalf("FATAL: CSRF_AUTH_KEY must be at least 32 bytes long. Current length: %d", len(csrfAuthKeyStr))
	}

	accessTokenExpiryStr := getEnv("ACCESS_TOKEN_EXPIRY", "60m")    // Default to 60 minutes
	refreshTokenExpiryStr := getEnv("REFRESH_TOKEN_EXPIRY", "168h") // Default to 7 days (168h)

	accessTokenExpiry, err := time.ParseDuration(accessTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid ACCESS_TOKEN_EXPIRY format '%s'. Using default 60m. Error: %v", accessTokenExpiryStr, err)
		accessTokenExpiry = 60 * time.Minute
	}

	refreshTokenExpiry, err := time.ParseDuration(refreshTokenExpiryStr)
	if err != nil {
		log.Printf("WARNING: Invalid REFRESH_TOKEN_EXPIRY format '%s'. Using default 7d (168h). Error: %v", refreshTokenExpiryStr, err)
		refreshTokenExpiry = 7 * 24 * time.Hour // 7 days
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
	}

	log.Printf("Configuration loaded: Port=%s, LogLevel=%s, DBPath=%s, AccessTokenExpiry=%s, RefreshTokenExpiry=%s",
		Cfg.Port, Cfg.LogLevel, Cfg.DatabasePath, Cfg.AccessTokenExpiry, Cfg.RefreshTokenExpiry)
}

// getEnv retrieves an environment variable or returns a default value.
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	log.Printf("Environment variable %s not set, using default: %s", key, fallback)
	return fallback
}

// getEnvAsInt retrieves an environment variable as an integer or returns a default.
// Not used in current Cfg struct, but useful for future additions.
func getEnvAsInt(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" { // If fallback was empty and env var not set
		log.Printf("Missing integer value for %s, using default: %d", key, fallback)
		return fallback
	}
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid integer value for %s ('%s'), using default: %d", key, valueStr, fallback)
	return fallback
}

// getEnvAsDuration retrieves an environment variable as time.Duration or returns a default.
// This function is effectively replaced by direct parsing in LoadConfig for specific duration fields.
// Keeping it here in case it's useful for other generic duration configs in the future.
func getEnvAsDuration(key string, fallback time.Duration) time.Duration {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		log.Printf("Missing duration value for %s, using default: %s", key, fallback.String())
		return fallback
	}
	if value, err := time.ParseDuration(valueStr); err == nil {
		return value
	}
	log.Printf("Invalid duration value for %s ('%s'), using default: %s", key, valueStr, fallback.String())
	return fallback
}
