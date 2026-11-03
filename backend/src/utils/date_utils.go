package utils

import (
	"log"
	"time"
	_ "time/tzdata" // The production image has no timezone database
)

const DefaultDateFormat = "02-01-2006"

// ExchangeLocation returns the location of an exchange's timezone name, as reported by Yahoo.
// Daily timestamps must be read in this location: FX days start at midnight in London, which is
// 23:00 UTC of the previous day in summer. It returns UTC if the name is unknown.
func ExchangeLocation(timezoneName string) *time.Location {
	location, err := time.LoadLocation(timezoneName)
	if timezoneName == "" || err != nil {
		log.Printf("Unknown exchange timezone '%s', using UTC: %v", timezoneName, err)
		return time.UTC
	}
	return location
}

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
