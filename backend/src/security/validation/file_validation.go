package validation

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/username/taxfolio/backend/src/logger"
)

// AllowedClientContentTypes is a map for quick lookup of allowed client-declared MIME types.
var AllowedClientContentTypes = map[string]bool{
	"text/csv":                 true,
	"application/csv":          true,
	"application/vnd.ms-excel": true, // Often used for CSV by older Excel
	"text/plain":               true, // CSVs are often plain text
	"application/octet-stream": true, // Fallback, but be more cautious
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": false, // .xlsx, explicitly disallow for CSV endpoint
}

// ValidateClientContentType checks the Content-Type header provided by the client.
func ValidateClientContentType(contentType string) error {
	if allowed, exists := AllowedClientContentTypes[strings.ToLower(contentType)]; !exists || !allowed {
		logger.L.Warn("Disallowed client-declared Content-Type", "contentType", contentType)
		return fmt.Errorf("client-declared file type '%s' is not allowed for CSV upload", contentType)
	}
	return nil
}

// ValidateFileContentByMagicBytes checks the actual file content signature (magic bytes).
// It returns the detected content type and an error if validation fails.
func ValidateFileContentByMagicBytes(file io.ReadSeeker) (string, error) {
	if file == nil {
		return "", fmt.Errorf("file is nil")
	}

	buffer := make([]byte, 512) // Read first 512 bytes for MIME detection
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("failed to read file for content type checking: %w", err)
	}

	// IMPORTANT: Reset the file read pointer to the beginning so the actual parser can read the full file.
	_, seekErr := file.Seek(0, io.SeekStart)
	if seekErr != nil {
		return "", fmt.Errorf("failed to reset file read pointer: %w", seekErr)
	}

	detectedContentType := http.DetectContentType(buffer[:n])
	detectedContentType = strings.ToLower(strings.Split(detectedContentType, ";")[0]) // Normalize (e.g. "text/plain; charset=utf-8")

	// For CSV, we are primarily concerned it's text-based and not something malicious like an executable.
	// "text/plain" is a very common and acceptable detected type for CSV.
	// "application/csv" might be detected by some systems.
	// "application/octet-stream" is a generic fallback, can be risky if not followed by strict parsing.
	// We allow octet-stream here but rely on later parsing to fail if it's not actually CSV.
	allowedDetectedTypes := map[string]bool{
		"text/plain":               true,
		"text/csv":                 true,
		"application/csv":          true,
		"application/octet-stream": true, // Be cautious with this; strict parsing is key later
	}

	if !allowedDetectedTypes[detectedContentType] {
		logger.L.Warn("Disallowed detected file content type (magic bytes)", "detectedContentType", detectedContentType)
		return detectedContentType, fmt.Errorf("detected file content type '%s' is not consistent with a CSV file", detectedContentType)
	}

	logger.L.Debug("File content type (magic bytes) validated", "detectedContentType", detectedContentType)
	return detectedContentType, nil
}
