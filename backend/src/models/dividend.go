package models

// DividendCountrySummary holds the aggregated dividend amounts for a specific country in a year.
type DividendCountrySummary struct {
	GrossAmt float64 `json:"gross_amt"`
	TaxedAmt float64 `json:"taxed_amt"`
}

// DividendTaxResult represents the final structure for the dividend tax summary endpoint.
// map[Year]map[Country]DividendCountrySummary
type DividendTaxResult map[string]map[string]DividendCountrySummary

// NEW: DividendMetricsResult holds global and forward-looking dividend metrics.
type DividendMetricsResult struct {
	TotalDividendsTTM float64   `json:"total_dividends_ttm"` // Total Dividendos TTM (Last 12 Months)
	PortfolioYield    float64   `json:"portfolio_yield"`     // Dividend Yield atual
	YieldOnCost       float64   `json:"yield_on_cost"`       // Yield on Cost
	ProjectionByMonth []float64 `json:"projection_by_month"` // Previsão de dividendos nos próximos 12 meses
	LastUpdated       string    `json:"last_updated"`        // Data da última atualização dos preços/cálculos
	HasData           bool      `json:"has_data"`            // Flag se há posições ou transações
}
