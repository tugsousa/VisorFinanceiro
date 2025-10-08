// backend/src/logger/logger.go
package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"
)

var L *slog.Logger // Global logger instance

// Define um tipo de chave para evitar colisões com outras chaves de contexto.
type contextKey string

const loggerKey contextKey = "logger"

// InitLogger initializes the global logger.
// Call this once at application startup, after loading config.
func InitLogger(logLevelStr string) {
	// ... (O resto da função InitLogger permanece inalterado)
	var level slog.Level
	switch strings.ToLower(logLevelStr) {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
		// Use slog directly here as our L might not be initialized yet for this warning.
		slog.Warn("Invalid LOG_LEVEL specified, defaulting to INFO", "configuredLevel", logLevelStr)
	}

	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				// Format time as RFC3339 for better machine readability
				if t, ok := a.Value.Any().(time.Time); ok {
					a.Value = slog.StringValue(t.Format(time.RFC3339))
				}
			}
			return a
		},
	}

	// Use JSON handler for structured logs
	handler := slog.NewJSONHandler(os.Stdout, opts)
	L = slog.New(handler)

	slog.SetDefault(L) // Set as default logger for packages that use log.Default() or slog's top-level functions
	L.Info("Logger initialized", "level", level.String())
}

// FromContext retrieves a logger from context, or returns the default global logger.
func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(loggerKey).(*slog.Logger); ok {
		return logger
	}
	return L // Return global logger if none in context
}

// ToContext embeds a slog.Logger into a context.Context.
func ToContext(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey, logger)
}

// InfoFromContext logs a message at Info level using the contextual logger.
func InfoFromContext(ctx context.Context, msg string, args ...any) {
	FromContext(ctx).Info(msg, args...)
}

// ErrorFromContext logs a message at Error level using the contextual logger.
func ErrorFromContext(ctx context.Context, msg string, args ...any) {
	FromContext(ctx).Error(msg, args...)
}
