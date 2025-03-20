package processors

import (
	"TAXFOLIO/src/models"
	"strings"
)

// DividendResult represents the grouped dividend amounts by year, country, and type (gross or taxed).
type DividendResult map[string]map[string]map[string]float64

// CalculateDividends processes the transactions and groups dividend amounts by year, country, and type.
func CalculateDividends(transactions []models.ProcessedTransaction) DividendResult {
	// Map to hold the results grouped by year, country, and type of amount (gross or taxed)
	result := make(DividendResult)

	for _, t := range transactions {
		// Determine if the transaction is a "dividendo" or "imposto sobre dividendo"
		transactionType := strings.ToLower(t.OrderType)
		if transactionType != "dividendo" && transactionType != "imposto sobre dividendo" {
			continue // Skip other transaction types
		}

		// Extract the year from the Date field
		dateParts := strings.Split(t.Date, "-")
		if len(dateParts) != 3 {
			continue // Skip invalid dates
		}
		year := dateParts[2] // Extract the year

		// Get the country code from ISIN (first 2 characters)
		if len(t.ISIN) < 2 {
			continue // Skip invalid ISINs
		}
		country := t.ISIN[:2]

		// Use AmountEUR directly (already converted to EUR)
		amount := t.AmountEUR

		// Initialize the map for the year and country if they don't exist
		if _, ok := result[year]; !ok {
			result[year] = make(map[string]map[string]float64)
		}
		if _, ok := result[year][country]; !ok {
			result[year][country] = make(map[string]float64)
			result[year][country]["gross_amt"] = 0.0
			result[year][country]["taxed_amt"] = 0.0
		}

		// Add the amount to the appropriate field (gross_amt or taxed_amt)
		if transactionType == "dividendo" {
			result[year][country]["gross_amt"] += amount
		} else if transactionType == "imposto sobre dividendo" {
			result[year][country]["taxed_amt"] += amount
		}
	}

	return result
}
