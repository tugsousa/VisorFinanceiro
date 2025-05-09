package models

// DividendCountrySummary holds the aggregated dividend amounts for a specific country in a year.
type DividendCountrySummary struct {
	GrossAmt float64 `json:"gross_amt"`
	TaxedAmt float64 `json:"taxed_amt"`
}

// DividendTaxResult represents the final structure for the dividend tax summary endpoint.
// map[Year]map[Country]DividendCountrySummary
type DividendTaxResult map[string]map[string]DividendCountrySummary
