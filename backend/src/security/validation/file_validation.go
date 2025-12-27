package validation

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/username/taxfolio/backend/src/logger"
)

// AllowedClientContentTypes is a map for quick lookup of allowed client-declared MIME types.
var AllowedClientContentTypes = map[string]bool{
	"text/csv":                 true,
	"text/xml":                 true,
	"application/csv":          true,
	"application/vnd.ms-excel": true, // Often used for CSV by older Excel
	"text/plain":               true, // CSVs are often plain text
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": false, // .xlsx explicitly disallow
}

// ValidateClientContentType checks the Content-Type header provided by the client.
func ValidateClientContentType(contentType string) error {
	if allowed, exists := AllowedClientContentTypes[strings.ToLower(contentType)]; !exists || !allowed {
		logger.L.Warn("Disallowed client-declared Content-Type", "contentType", contentType)
		return fmt.Errorf("client-declared file type '%s' is not allowed for CSV upload", contentType)
	}
	return nil
}

// isBinaryContent checks if a buffer contains binary control characters (like null bytes)
// which indicate the file is likely not a valid text-based CSV/XML.
func isBinaryContent(buf []byte) bool {
	// 1. Check for null bytes. Text files (CSV/XML) should not have these.
	if bytes.IndexByte(buf, 0) != -1 {
		return true
	}

	// 2. Validate UTF-8. If it's invalid UTF-8, it might be binary garbage.
	if !utf8.Valid(buf) {
		return true
	}

	return false
}

// ValidateFileContentByMagicBytes checks the actual file content signature (magic bytes)
// and inspects the content to ensure it is text-based.
func ValidateFileContentByMagicBytes(file io.ReadSeeker) (string, error) {
	if file == nil {
		return "", fmt.Errorf("file is nil")
	}

	// Read first 1024 bytes (1KB) for detection
	buffer := make([]byte, 1024)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("failed to read file for content type checking: %w", err)
	}

	// IMPORTANT: Reset the file read pointer to the beginning so the actual parser can read the full file.
	_, seekErr := file.Seek(0, io.SeekStart)
	if seekErr != nil {
		return "", fmt.Errorf("failed to reset file read pointer: %w", seekErr)
	}

	// If file is empty, fail early
	if n == 0 {
		return "", fmt.Errorf("file is empty")
	}

	// 1. Strict Content Inspection: Check for binary characters
	if isBinaryContent(buffer[:n]) {
		logger.L.Warn("File rejected: Binary content detected in text upload")
		return "application/octet-stream", fmt.Errorf("file appears to be binary or executable, not text/CSV")
	}

	// 2. HTTP Content Detection
	detectedContentType := http.DetectContentType(buffer[:n])
	detectedContentType = strings.ToLower(strings.Split(detectedContentType, ";")[0]) // Normalize

	// Allowed detected types. Note we removed generic octet-stream unless it passed the binary check,
	// but standard http.DetectContentType defaults to octet-stream for anything it doesn't recognize.
	// Since we already ran isBinaryContent(), if it is still octet-stream here, it's likely weird text
	// or a format Go doesn't know. We will force a stricter list here.
	allowedDetectedTypes := map[string]bool{
		"text/plain":      true,
		"text/csv":        true,
		"text/xml":        true,
		"application/xml": true,
		"application/csv": true,
	}

	if !allowedDetectedTypes[detectedContentType] {
		// Log specific warning for octet-stream even if it passed binary check
		if detectedContentType == "application/octet-stream" {
			logger.L.Warn("File rejected: content type detected as octet-stream (ambiguous)")
		} else {
			logger.L.Warn("Disallowed detected file content type", "detectedContentType", detectedContentType)
		}
		return detectedContentType, fmt.Errorf("detected file content type '%s' is not allowed", detectedContentType)
	}

	logger.L.Debug("File content type validated", "detectedContentType", detectedContentType)
	return detectedContentType, nil
}
