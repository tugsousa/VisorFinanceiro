// backend/src/validation/content_scanner.go
package validation

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/username/taxfolio/backend/src/logger"
)

var (
	// More comprehensive SQL Injection keywords/patterns. This is still not exhaustive.
	// Parameterized queries are the primary defense.
	sqlKeywordsRegex = regexp.MustCompile(
		`(?i)\b(ALTER|CREATE|DELETE|DROP|EXEC|EXECUTE|INSERT|MERGE|SELECT|UPDATE|UNION|TRUNCATE)\b|--|;|/\*|\*/|xp_`,
	)
	// Common XSS vectors. Contextual output encoding is the primary defense.
	xssPatternsRegex = regexp.MustCompile(
		`(?i)<script|onerror=|onmouseover=|onfocus=|onload=|javascript:|vbscript:| Livescript:|mocha:|<iframe|<object|<embed|<applet|<style|<link|<img\s+src\s*=\s*['"]?\s*(javascript|data):`,
	)
	// Formula injection characters at the start of a string
	formulaInjectionPrefixRegex = regexp.MustCompile(`^[=+\-@\t\r]`) // Added tab and carriage return as Excel sometimes treats them as triggers
)

func truncateForLog(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}

// CheckSQLInjectionKeywords detects basic SQL injection patterns.
// This is a defense-in-depth measure; parameterized queries are crucial.
func CheckSQLInjectionKeywords(s, fieldName, contextID string) error {
	if sqlKeywordsRegex.MatchString(s) {
		errMsg := fmt.Sprintf("potential SQL injection pattern detected in field '%s'", fieldName)
		logger.L.Warn(errMsg, "contextID", contextID, "contentPreview", truncateForLog(s, 50))
		return fmt.Errorf("%w: %s", ErrValidationFailed, errMsg)
	}
	return nil
}

// CheckXSSPatterns detects basic XSS patterns.
// This is a defense-in-depth measure; output encoding is crucial.
func CheckXSSPatterns(s, fieldName, contextID string) error {
	if xssPatternsRegex.MatchString(s) {
		errMsg := fmt.Sprintf("potential XSS pattern detected in field '%s'", fieldName)
		logger.L.Warn(errMsg, "contextID", contextID, "contentPreview", truncateForLog(s, 50))
		return fmt.Errorf("%w: %s", ErrValidationFailed, errMsg)
	}
	return nil
}

// CheckFormulaInjection detects if a string starts with characters common in CSV formula injection.
func CheckFormulaInjection(s, fieldName, contextID string) error {
	// Check only the first few characters to avoid performance issues on very long strings,
	// as formula injection usually relies on the prefix.
	prefixToCheck := s
	if len(s) > 10 { // Arbitrary small length to check prefix
		prefixToCheck = s[:10]
	}
	if formulaInjectionPrefixRegex.MatchString(strings.TrimSpace(prefixToCheck)) { // Trim space before checking prefix
		errMsg := fmt.Sprintf("potential formula injection pattern detected in field '%s'", fieldName)
		logger.L.Warn(errMsg, "contextID", contextID, "contentPreview", truncateForLog(s, 50))
		return fmt.Errorf("%w: %s", ErrValidationFailed, errMsg)
	}
	return nil
}
