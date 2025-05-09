package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"
)

var L *slog.Logger // Global logger instance

// InitLogger initializes the global logger.
// Call this once at application startup, after loading config.
func InitLogger(logLevelStr string) {
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
				// Or remove if not needed: return slog.Attr{}
				if t, ok := a.Value.Any().(time.Time); ok {
					a.Value = slog.StringValue(t.Format(time.RFC3339))
				}
			}
			return a
		},
	}

	// Use JSON handler for structured logs
	handler := slog.NewJSONHandler(os.Stdout, opts)
	// For local development, TextHandler might be more readable:
	// handler := slog.NewTextHandler(os.Stdout, opts)
	L = slog.New(handler)

	slog.SetDefault(L) // Set as default logger for packages that use log.Default() or slog's top-level functions
	L.Info("Logger initialized", "level", level.String())
}

// FromContext retrieves a logger from context, or returns the default global logger.
// This is a placeholder for more advanced context-aware logging (e.g., with request IDs).
func FromContext(ctx context.Context) *slog.Logger {
	// if logger, ok := ctx.Value(loggerKey).(*slog.Logger); ok {
	//  return logger
	// }
	return L // Return global logger if none in context
}

// Add a context key type if you plan to store loggers in context
// type contextKey string
// const loggerKey = contextKey("logger")
