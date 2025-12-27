// backend/src/validation/sanitizers.go
package validation

import (
	"strings"
	"unicode"

	"github.com/microcosm-cc/bluemonday"
)

// ErrValidationFailed remains the same
// (The declaration was moved to field_validator.go)

var (
	// Definition of strict sanitization policy
	strictHTMLPolicy *bluemonday.Policy
)

func init() {
	// Initialize strict policy once at startup
	strictHTMLPolicy = bluemonday.StrictPolicy() // Removes all HTML tags
}

// SanitizeText removes all HTML tags and attributes from an input string,
// preventing XSS before saving to the database.
func SanitizeText(s string) string {
	return strictHTMLPolicy.Sanitize(s)
}

// SanitizeForFormulaInjection prepends a single quote if the string starts with a formula character.
// This prevents CSV Injection (Formula Injection) in Excel/Sheets.
func SanitizeForFormulaInjection(s string) string {
	// It is safer to check the trimmed string to find the trigger character,
	// but apply the fix to the original string to preserve formatting.
	trimmed := strings.TrimSpace(s)

	if len(trimmed) == 0 {
		return s
	}

	firstChar := rune(trimmed[0])

	// List of characters that trigger formula execution in Excel/LibreOffice/Sheets
	if firstChar == '=' || firstChar == '+' || firstChar == '-' || firstChar == '@' || firstChar == '\t' || firstChar == '\r' {
		// Prepend a single quote (') which forces the cell to be treated as text
		return "'" + s
	}

	return s
}

// StripUnprintable removes non-printable characters, allowing common whitespace
// like space, tab, newline, and carriage return.
func StripUnprintable(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsPrint(r) || r == '\t' || r == '\n' || r == '\r' {
			return r
		}
		return -1 // Drop the rune
	}, s)
}
