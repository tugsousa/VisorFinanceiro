// backend/src/validation/field_validator.go
package validation

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/username/taxfolio/backend/src/logger" // Keep logger if used for warnings on unknown currencies etc.
)

// ErrValidationFailed remains the same
var ErrValidationFailed = fmt.Errorf("validation failed")

// Constants for lengths remain here
const (
	DefaultMaxStringLength = 255
	MaxISINLength          = 12
	MaxCurrencyCodeLength  = 3
	MaxOrderIDLength       = 100
	MaxProductNameLength   = 255
	MaxDescriptionLength   = 1024
)

// --- String Validators ---

// ValidateStringNotEmpty checks if a string is not empty after trimming.
func ValidateStringNotEmpty(s, fieldName string) error {
	if strings.TrimSpace(s) == "" {
		return fmt.Errorf("%w: %s cannot be empty", ErrValidationFailed, fieldName)
	}
	return nil
}

// ValidateStringMaxLength checks if a string's UTF-8 character count is within max bounds.
func ValidateStringMaxLength(s string, maxLength int, fieldName string) error {
	if utf8.RuneCountInString(s) > maxLength {
		return fmt.Errorf("%w: %s exceeds maximum length of %d characters", ErrValidationFailed, fieldName, maxLength)
	}
	return nil
}

// ValidateStringRegex checks if a string matches a given regex pattern.
func ValidateStringRegex(s string, pattern *regexp.Regexp, fieldName, formatDescription string) error {
	if !pattern.MatchString(s) {
		return fmt.Errorf("%w: %s ('%s') is not in the expected format (%s)", ErrValidationFailed, fieldName, s, formatDescription)
	}
	return nil
}

// --- Numeric Validators ---

// ValidateFloatString parses a string to float and checks if it's within a range.
func ValidateFloatString(s, fieldName string, allowNegative bool, minVal, maxVal float64) (float64, error) {
	trimmed := strings.TrimSpace(s)
	if err := ValidateStringNotEmpty(trimmed, fieldName+" (raw value)"); err != nil {
		// Allow empty strings to pass here if they are optional, let the caller handle empty vs non-empty.
		// If field is mandatory, ValidateStringNotEmpty should be called before this by the caller.
		// For now, if it's truly empty, we might not want to error, but if it's non-empty and invalid, we do.
		if strings.TrimSpace(s) == "" { // If the original string was empty, return 0 and no error for now.
			// Or, decide if empty float string is an error. Assuming optional for now.
			// If it must not be empty, the caller should do ValidateStringNotEmpty first.
			return 0, nil // Or an error if empty is not allowed for this specific float.
		}
		return 0, err // Propagate "cannot be empty" if that's what ValidateStringNotEmpty decided.
	}

	val, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: %s ('%s') is not a valid float: %v", ErrValidationFailed, fieldName, s, err)
	}
	if !allowNegative && val < 0 {
		logger.L.Warn("Negative value not allowed for field", "field", fieldName, "value", val)
		return 0, fmt.Errorf("%w: %s cannot be negative", ErrValidationFailed, fieldName)
	}
	if val < minVal || val > maxVal {
		logger.L.Warn("Float value out of range", "field", fieldName, "value", val, "min", minVal, "max", maxVal)
		return 0, fmt.Errorf("%w: %s must be between %.2f and %.2f, got %.2f", ErrValidationFailed, fieldName, minVal, maxVal, val)
	}
	return val, nil
}

// ValidateIntString parses a string to int and checks if it's within a range.
func ValidateIntString(s, fieldName string, allowNegative bool, minVal, maxVal int) (int, error) {
	trimmed := strings.TrimSpace(s)
	if err := ValidateStringNotEmpty(trimmed, fieldName+" (raw value)"); err != nil {
		// Similar logic to ValidateFloatString for handling emptiness
		if strings.TrimSpace(s) == "" {
			return 0, nil // Or an error if empty is not allowed.
		}
		return 0, err
	}

	val, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0, fmt.Errorf("%w: %s ('%s') is not a valid integer: %v", ErrValidationFailed, fieldName, s, err)
	}
	if !allowNegative && val < 0 {
		logger.L.Warn("Negative value not allowed for field", "field", fieldName, "value", val)
		return 0, fmt.Errorf("%w: %s cannot be negative", ErrValidationFailed, fieldName)
	}
	if val < minVal || val > maxVal {
		logger.L.Warn("Integer value out of range", "field", fieldName, "value", val, "min", minVal, "max", maxVal)
		return 0, fmt.Errorf("%w: %s must be between %d and %d, got %d", ErrValidationFailed, fieldName, minVal, maxVal, val)
	}
	return val, nil
}

// --- Date Validator ---

// ValidateDateString checks if a string is a valid date in "DD-MM-YYYY" format.
func ValidateDateString(s, fieldName string) (time.Time, error) {
	trimmed := strings.TrimSpace(s)
	if err := ValidateStringNotEmpty(trimmed, fieldName); err != nil {
		return time.Time{}, err
	}
	t, err := time.Parse("02-01-2006", trimmed)
	if err != nil {
		return time.Time{}, fmt.Errorf("%w: %s ('%s') is not a valid date (expected DD-MM-YYYY): %v", ErrValidationFailed, fieldName, s, err)
	}
	if t.Format("02-01-2006") != trimmed {
		return time.Time{}, fmt.Errorf("%w: %s ('%s') is an invalid date (e.g., day/month mismatch)", ErrValidationFailed, fieldName, s)
	}
	return t, nil
}

// --- Specific Format Validators ---

// Regexes for specific formats are defined here (they are not for general content scanning)
var (
	isinRegex         = regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)
	currencyCodeRegex = regexp.MustCompile(`^[A-Z]{3}$`)
	orderIDRegex      = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

// ValidateISIN checks if a string is a plausible ISIN format.
func ValidateISIN(s string) error {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}
	if err := ValidateStringMaxLength(trimmed, MaxISINLength, "ISIN"); err != nil {
		return err
	}
	return ValidateStringRegex(trimmed, isinRegex, "ISIN", "2 letters, 9 alphanumeric, 1 digit")
}

// ValidateCurrencyCode checks if currency code is 3 uppercase letters.
func ValidateCurrencyCode(s string) error {
	trimmed := strings.ToUpper(strings.TrimSpace(s)) // Normalize to uppercase before validation
	if trimmed == "" {
		return nil
	}
	if err := ValidateStringMaxLength(trimmed, MaxCurrencyCodeLength, "Currency Code"); err != nil {
		return err
	}
	// Check against known list or just format
	// For now, just format. A real app might have a list of allowed currencies.
	if !currencyCodeRegex.MatchString(trimmed) {
		return fmt.Errorf("%w: Currency Code ('%s') is not in the expected format (3 uppercase letters)", ErrValidationFailed, s)
	}
	return nil
}

// ValidateOrderID checks format and length for OrderID.
func ValidateOrderID(s string) error {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" { // <--- ALLOW EMPTY ORDER ID
		return nil
	}
	// If not empty, then validate length and regex
	if err := ValidateStringMaxLength(trimmed, MaxOrderIDLength, "Order ID"); err != nil {
		return err
	}
	return ValidateStringRegex(trimmed, orderIDRegex, "Order ID", "alphanumeric with hyphens/underscores")
}
