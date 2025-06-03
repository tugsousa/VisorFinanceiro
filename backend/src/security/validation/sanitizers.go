// backend/src/validation/sanitizers.go
package validation

import (
	"strings"
	"unicode"
	// "github.com/microcosm-cc/bluemonday" // For more robust HTML sanitization if needed
)

// SanitizeForFormulaInjection prepends a single quote if the string starts with a formula character.
// This makes most spreadsheet software treat it as text.
func SanitizeForFormulaInjection(s string) string {
	trimmed := strings.TrimSpace(s)
	if len(trimmed) > 0 {
		firstChar := rune(trimmed[0])
		if firstChar == '=' || firstChar == '+' || firstChar == '-' || firstChar == '@' || firstChar == '\t' || firstChar == '\r' {
			return "'" + s // Prepend to the original string 's', not 'trimmed' to preserve original spacing if intended
		}
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

/*
// Example of using a robust HTML sanitizer (like bluemonday)
// You would need to add `github.com/microcosm-cc/bluemonday` to your go.mod
var (
	strictHTMLPolicy *bluemonday.Policy
)

func init() {
	strictHTMLPolicy = bluemonday.StrictPolicy() // Strips all HTML
	// Or use UGC policy for limited safe HTML:
	// strictHTMLPolicy = bluemonday.UGCPolicy()
}

// SanitizeHTMLStripTags removes all HTML tags using a strict policy.
func SanitizeHTMLStripTags(htmlInput string) string {
	return strictHTMLPolicy.Sanitize(htmlInput)
}
*/
