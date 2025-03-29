package utils

import (
	"log"
	"time"
)

const DefaultDateFormat = "02-01-2006"

// ParseDate parses a date string using the default format.
// Logs an error and returns zero time if parsing fails.
func ParseDate(dateStr string) time.Time {
	t, err := time.Parse(DefaultDateFormat, dateStr)
	if err != nil {
		log.Printf("Error parsing date '%s' with format '%s': %v. Returning zero time.", dateStr, DefaultDateFormat, err)
		return time.Time{} // Return zero time on error
	}
	return t
}
