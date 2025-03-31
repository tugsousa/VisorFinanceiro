package services

import (
	"TAXFOLIO/src/models"
	"TAXFOLIO/src/processors" // Import processors to use DividendResult
	"io"
)

// UploadResult holds the aggregated results from all processors.
type UploadResult struct {
	DividendResult    processors.DividendResult // Use the specific type from processors
	StockSaleDetails  []models.SaleDetail
	StockHoldings     []models.PurchaseLot
	OptionSaleDetails []models.OptionSaleDetail
	OptionHoldings    []models.OptionHolding
	// Add other potential results here if needed
}

// UploadService defines the interface for the core upload processing logic.
type UploadService interface {
	ProcessUpload(fileReader io.Reader) (*UploadResult, error)
}
