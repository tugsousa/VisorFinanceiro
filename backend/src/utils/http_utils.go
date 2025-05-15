// backend/src/utils/http_utils.go
package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
