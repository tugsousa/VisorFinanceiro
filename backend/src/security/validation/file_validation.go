// backend/src/security/validation/file_validation.go
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
	"application/vnd.ms-excel": true,
	"text/plain":               true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": false,
}

// ValidateClientContentType checks the Content-Type header provided by the client.
func ValidateClientContentType(contentType string) error {
	if allowed, exists := AllowedClientContentTypes[strings.ToLower(contentType)]; !exists || !allowed {
		logger.L.Warn("Disallowed client-declared Content-Type", "contentType", contentType)
		return fmt.Errorf("client-declared file type '%s' is not allowed", contentType)
	}
	return nil
}

// isBinaryContent checks if a buffer contains binary control characters.
func isBinaryContent(buf []byte) bool {
	if bytes.IndexByte(buf, 0) != -1 {
		return true
	}
	if !utf8.Valid(buf) {
		return true
	}
	return false
}

// trimIncompleteRune removes a multi-byte character cut off at the end of a sample, which would
// otherwise make valid UTF-8 look invalid.
func trimIncompleteRune(sample []byte) []byte {
	for size := 1; size < utf8.UTFMax && size <= len(sample); size++ {
		start := len(sample) - size
		if utf8.RuneStart(sample[start]) {
			if !utf8.FullRune(sample[start:]) {
				return sample[:start]
			}
			break
		}
	}
	return sample
}

// SECURITY FIX: Check for XML DOCTYPE to prevent XXE
func containsXMLDoctype(buf []byte) bool {
	// Simple check for the presence of "<!DOCTYPE" which is required for XXE attacks
	// Convert buffer slice to string for case-insensitive check
	content := string(buf)
	return strings.Contains(strings.ToUpper(content), "<!DOCTYPE")
}

// ValidateFileContentByMagicBytes checks the actual file content signature.
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

	// Reset the file read pointer
	_, seekErr := file.Seek(0, io.SeekStart)
	if seekErr != nil {
		return "", fmt.Errorf("failed to reset file read pointer: %w", seekErr)
	}

	if n == 0 {
		return "", fmt.Errorf("file is empty")
	}

	sample := buffer[:n]
	if n == len(buffer) { // Only a full buffer can have cut a character off
		sample = trimIncompleteRune(sample)
	}

	if isBinaryContent(sample) {
		logger.L.Warn("File rejected: Binary content detected in text upload")
		return "application/octet-stream", fmt.Errorf("file appears to be binary or executable")
	}

	// HTTP Content Detection
	detectedContentType := http.DetectContentType(buffer[:n])
	detectedContentType = strings.ToLower(strings.Split(detectedContentType, ";")[0])

	allowedDetectedTypes := map[string]bool{
		"text/plain":      true,
		"text/csv":        true,
		"text/xml":        true,
		"application/xml": true,
		"application/csv": true,
	}

	if !allowedDetectedTypes[detectedContentType] {
		if detectedContentType == "application/octet-stream" {
			logger.L.Warn("File rejected: content type detected as octet-stream (ambiguous)")
		} else {
			logger.L.Warn("Disallowed detected file content type", "detectedContentType", detectedContentType)
		}
		return detectedContentType, fmt.Errorf("detected file content type '%s' is not allowed", detectedContentType)
	}

	// If it looks like XML, ensure no DOCTYPE is present (XXE Mitigation)
	if strings.Contains(detectedContentType, "xml") || strings.Contains(detectedContentType, "text") {
		if containsXMLDoctype(buffer[:n]) {
			logger.L.Warn("File rejected: Potential XXE vector (DOCTYPE) detected", "contentType", detectedContentType)
			return detectedContentType, fmt.Errorf("file contains forbidden XML DOCTYPE declaration")
		}
	}

	logger.L.Debug("File content type validated", "detectedContentType", detectedContentType)
	return detectedContentType, nil
}
