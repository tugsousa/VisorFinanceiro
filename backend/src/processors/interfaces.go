package processors

import (
	"github.com/username/taxfolio/backend/src/models"
)

// DividendResult represents the grouped dividend amounts by year, country, and type.
// Defined here to be used by the DividendProcessor interface.
type DividendResult map[string]map[string]map[string]float64

// DividendProcessor defines the interface for calculating dividend results.
type DividendProcessor interface {
	Calculate(transactions []models.ProcessedTransaction) DividendResult // Deprecated: Use CalculateTaxSummary for tax-specific format
	CalculateTaxSummary(transactions []models.ProcessedTransaction) models.DividendTaxResult
}

// StockProcessor defines the interface for processing stock transactions.
type StockProcessor interface {
	// Process takes a full list of transactions and returns all derived data:
	// 1. A complete list of all calculated sale details.
	// 2. A map of open purchase lots, keyed by year, for historical views.
	Process(transactions []models.ProcessedTransaction) ([]models.SaleDetail, map[string][]models.PurchaseLot)
}

// OptionProcessor defines the interface for processing option transactions.
type OptionProcessor interface {
	Process(transactions []models.ProcessedTransaction) ([]models.OptionSaleDetail, []models.OptionHolding)
}

// CashMovementProcessor defines the interface for processing cash deposits and withdrawals.
type CashMovementProcessor interface {
	Process(transactions []models.ProcessedTransaction) []models.CashMovement
}
type FeeProcessor interface {
	Process(transactions []models.ProcessedTransaction) []models.FeeDetail
}
