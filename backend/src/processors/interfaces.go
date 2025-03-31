package processors

import (
	"TAXFOLIO/src/models"
)

// DividendResult represents the grouped dividend amounts by year, country, and type.
// Defined here to be used by the DividendProcessor interface.
type DividendResult map[string]map[string]map[string]float64

// DividendProcessor defines the interface for calculating dividend results.
type DividendProcessor interface {
	Calculate(transactions []models.ProcessedTransaction) DividendResult
}

// StockProcessor defines the interface for processing stock transactions.
type StockProcessor interface {
	Process(transactions []models.ProcessedTransaction) ([]models.SaleDetail, []models.PurchaseLot)
}

// OptionProcessor defines the interface for processing option transactions.
type OptionProcessor interface {
	Process(transactions []models.ProcessedTransaction) ([]models.OptionSaleDetail, []models.OptionHolding)
}
