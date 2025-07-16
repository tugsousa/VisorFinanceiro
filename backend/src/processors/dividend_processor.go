package processors

import (
	"math"
	"strings"
	"time" // Import time package

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils" // Added import for country utils
)

// dividendProcessorImpl implements the DividendProcessor interface.
type dividendProcessorImpl struct{}

// NewDividendProcessor creates a new instance of DividendProcessor.
func NewDividendProcessor() DividendProcessor {
	return &dividendProcessorImpl{}
}

// Calculate processes the transactions and groups dividend amounts by year, country, and type.
// Deprecated: Use CalculateTaxSummary for the new tax-specific format.
func (p *dividendProcessorImpl) Calculate(transactions []models.ProcessedTransaction) DividendResult {
	// ... (existing implementation remains for potential other uses) ...
	result := make(DividendResult)

	for _, t := range transactions {
		transactionType := strings.ToLower(t.TransactionType)
		if transactionType != "dividend" {
			continue
		}

		parsedTime, err := time.Parse("02-01-2006", t.Date) // Assuming DD-MM-YYYY format
		if err != nil {
			// Handle or log the error if the date format is incorrect
			continue
		}
		year := parsedTime.Format("2006") // Extract the year as string "YYYY"

		if len(t.ISIN) < 2 {
			continue
		}
		countryFormattedString := utils.GetCountryCodeString(t.ISIN)
		amount := roundToTwoDecimalPlaces(t.AmountEUR)

		if _, ok := result[year]; !ok {
			result[year] = make(map[string]map[string]float64)
		}
		if _, ok := result[year][countryFormattedString]; !ok {
			result[year][countryFormattedString] = make(map[string]float64)
			result[year][countryFormattedString]["gross_amt"] = 0.0
			result[year][countryFormattedString]["taxed_amt"] = 0.0
		}

		if transactionType == "dividend" {
			result[year][countryFormattedString]["gross_amt"] += amount
		} else if transactionType == "dividendtax" {
			result[year][countryFormattedString]["taxed_amt"] += amount
		}
	}
	return result
}

// CalculateTaxSummary processes transactions and returns dividend data aggregated for tax reporting.
func (p *dividendProcessorImpl) CalculateTaxSummary(transactions []models.ProcessedTransaction) models.DividendTaxResult {
	result := make(models.DividendTaxResult)

	for _, t := range transactions {
		transactionType := strings.ToLower(t.TransactionType)
		if transactionType != "dividend" {
			continue // Skip other transaction types
		}

		// Extract the year from the Date field (assuming DD-MM-YYYY format)
		parsedTime, err := time.Parse("02-01-2006", t.Date)
		if err != nil {
			// Handle or log the error if the date format is incorrect
			// For now, skip this transaction
			continue
		}
		year := parsedTime.Format("2006") // Extract the year as string "YYYY"

		// Get the formatted country string (e.g., "840 - United States of America (the)")
		if len(t.ISIN) < 2 {
			continue // Skip invalid ISINs
		}
		countryFormattedString := utils.GetCountryCodeString(t.ISIN)

		// Use AmountEUR directly and round it
		amount := roundToTwoDecimalPlaces(t.AmountEUR)

		// Initialize maps if they don't exist
		if _, ok := result[year]; !ok {
			result[year] = make(map[string]models.DividendCountrySummary)
		}

		// Get the current summary for the country, or initialize if it doesn't exist
		summary := result[year][countryFormattedString] // This works even if the key doesn't exist yet (returns zero-value struct)

		// Add the amount to the appropriate field
		if transactionType == "dividend" && t.TransactionSubType != "TAX" {
			summary.GrossAmt += amount
		} else if transactionType == "dividend" && t.TransactionSubType == "TAX" {
			summary.TaxedAmt += amount // Tax is usually negative, so += works
		}

		// Update the map with the modified summary
		result[year][countryFormattedString] = summary
	}

	// Optional: Round final aggregated amounts again if needed due to potential floating point inaccuracies
	for year, countries := range result {
		for country, summary := range countries {
			summary.GrossAmt = roundToTwoDecimalPlaces(summary.GrossAmt)
			summary.TaxedAmt = roundToTwoDecimalPlaces(summary.TaxedAmt)
			result[year][country] = summary
		}
	}

	return result
}

// roundToTwoDecimalPlaces rounds a float64 to 2 decimal places.
func roundToTwoDecimalPlaces(value float64) float64 {
	return math.Round(value*100) / 100
}
