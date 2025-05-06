package services

import (
	"io"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors" // Import processors to use DividendResult
)

// UploadResult holds the aggregated results from all processors.
type UploadResult struct {
	DividendResult    processors.DividendResult // Use the specific type from processors
	StockSaleDetails  []models.SaleDetail
	StockHoldings     []models.PurchaseLot
	OptionSaleDetails []models.OptionSaleDetail
	OptionHoldings    []models.OptionHolding
	CashMovements     []models.CashMovement // Added for cash deposits/withdrawals
	// Add other potential results here if needed
}

// UploadService defines the interface for the core upload processing logic.
type UploadService interface {
	ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error)
	GetLatestUploadResult(userID int64) (*UploadResult, error)        // Added method to get stored result
	GetDividendTaxSummary() (models.DividendTaxResult, error)         // Added method for the new tax summary
	GetDividendTransactions() ([]models.ProcessedTransaction, error)  // Added method to get dividend transactions
	GetRawTransactions() ([]models.RawTransaction, error)             // Added method to get raw transactions
	GetProcessedTransactions() ([]models.ProcessedTransaction, error) // Added method to get all processed transactions
	GetStockHoldings() ([]models.PurchaseLot, error)                  // Added method to get stock holdings
	GetOptionHoldings() ([]models.OptionHolding, error)               // Added method to get option holdings
}
