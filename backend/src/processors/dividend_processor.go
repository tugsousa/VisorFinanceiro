package processors

import (
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

// dividendProcessorImpl implements the DividendProcessor interface.
type dividendProcessorImpl struct{}

// NewDividendProcessor creates a new instance of DividendProcessor.
func NewDividendProcessor() DividendProcessor {
	return &dividendProcessorImpl{}
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
			continue
		}
		year := parsedTime.Format("2006") // Extract the year as string "YYYY"

		if len(t.ISIN) < 2 {
			continue // Skip invalid ISINs
		}
		countryFormattedString := utils.GetCountryCodeString(t.ISIN)

		// PRECISION UPDATE: Use AmountEUR directly without rounding.
		// The frontend will handle formatting (2 decimal places usually, but precise for calcs).
		amount := t.AmountEUR

		if _, ok := result[year]; !ok {
			result[year] = make(map[string]models.DividendCountrySummary)
		}

		summary := result[year][countryFormattedString]

		if transactionType == "dividend" && t.TransactionSubType != "TAX" {
			summary.GrossAmt += amount
		} else if transactionType == "dividend" && t.TransactionSubType == "TAX" {
			summary.TaxedAmt += amount
		}

		result[year][countryFormattedString] = summary
	}

	return result
}

// Calculate is deprecated
func (p *dividendProcessorImpl) Calculate(transactions []models.ProcessedTransaction) DividendResult {
	result := make(DividendResult)
	return result
}
