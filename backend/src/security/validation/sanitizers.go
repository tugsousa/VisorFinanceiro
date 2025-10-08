// backend/src/validation/sanitizers.go
package validation

import (
	"strings"
	"unicode"

	"github.com/microcosm-cc/bluemonday" // <-- ADICIONADO
)

// ErrValidationFailed remains the same
// (A declaração foi movida para field_validator.go)

var (
	// Definição da política estrita de sanitização
	strictHTMLPolicy *bluemonday.Policy
)

func init() {
	// Inicializar a política estrita uma vez no arranque
	strictHTMLPolicy = bluemonday.StrictPolicy() // Remove todas as tags HTML
}

// SanitizeText remove todas as tags e atributos HTML de uma string de input,
// prevenindo XSS antes de guardar na base de dados.
func SanitizeText(s string) string {
	return strictHTMLPolicy.Sanitize(s)
}

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
