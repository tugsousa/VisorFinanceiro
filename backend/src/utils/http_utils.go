// backend/src/utils/http_utils.go
package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http" // Added for http.ResponseWriter and status codes

	"github.com/username/taxfolio/backend/src/logger" // For logger.L
)

// GenerateETag creates a SHA256 hash of the JSON representation of the data.
// Returns the ETag string (hex-encoded hash) and any error during JSON marshaling.
func GenerateETag(data interface{}) (string, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to marshal data for ETag generation: %w", err)
	}
	hash := sha256.Sum256(jsonData)
	return hex.EncodeToString(hash[:]), nil
}

// SendJSONError is a helper function to send JSON formatted error responses.
// It now resides in the utils package.
func SendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if logger.L != nil { // Check if logger is initialized
		logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	}
	// Even if logger isn't ready, still try to send the error response
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
