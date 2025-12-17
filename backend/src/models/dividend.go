package models

// DividendCountrySummary holds the aggregated dividend amounts for a specific country in a year.
type DividendCountrySummary struct {
	GrossAmt float64 `json:"gross_amt"`
	TaxedAmt float64 `json:"taxed_amt"`
}

// DividendTaxResult represents the final structure for the dividend tax summary endpoint.
type DividendTaxResult map[string]map[string]DividendCountrySummary

// Contribution Detail
type DividendContributor struct {
	Ticker string  `json:"ticker"`
	Amount float64 `json:"amount"`
}

// DividendMetricsResult holds global and forward-looking dividend metrics.
type DividendMetricsResult struct {
	TotalDividendsTTM   float64                       `json:"total_dividends_ttm"`
	PortfolioYield      float64                       `json:"portfolio_yield"`
	YieldOnCost         float64                       `json:"yield_on_cost"`
	ProjectionByMonth   []float64                     `json:"projection_by_month"`
	ProjectionBreakdown map[int][]DividendContributor `json:"projection_breakdown"`
	LastUpdated         string                        `json:"last_updated"`
	HasData             bool                          `json:"has_data"`
	YearlyYields        map[string]float64            `json:"yearly_yields"`
}
