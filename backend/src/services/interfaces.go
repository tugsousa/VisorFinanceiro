// backend/src/services/interfaces.go
package services

import (
	"io"

	"github.com/username/taxfolio/backend/src/models"
)

// UploadResult is primarily for the result of a single ProcessUpload call.
// It contains data derived *only* from the newly uploaded file.
type UploadResult struct {
	// These fields reflect the processing of the *current* upload batch.
	StockSaleDetails         []models.SaleDetail           // Sales from the current upload
	StockHoldings            []models.PurchaseLot          // Holdings *after* this upload, based on this upload's impact
	OptionSaleDetails        []models.OptionSaleDetail     // Options sales from this upload
	OptionHoldings           []models.OptionHolding        // Option holdings *after* this upload
	CashMovements            []models.CashMovement         // Cash movements in this upload
	DividendTransactionsList []models.ProcessedTransaction `json:"DividendTransactionsList,omitempty"`
}

// UploadService defines the interface for the core upload processing logic.
type UploadService interface {
	// ProcessUpload handles a new file upload, stores its transactions,
	// and returns an UploadResult based *only* on the processed file.
	ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error)

	// GetLatestUploadResult provides a comprehensive result based on *all*
	// historical transactions for the given user.
	// This is what pages like Holdings, TaxPage, etc., will typically use
	// to get a complete picture.
	GetLatestUploadResult(userID int64) (*UploadResult, error)

	// Specific getters that operate on a user's historical data from the DB.
	// These are alternatives to GetLatestUploadResult if only a subset of data is needed.
	GetDividendTaxSummary(userID int64) (models.DividendTaxResult, error)
	GetDividendTransactions(userID int64) ([]models.ProcessedTransaction, error) // Gets 'dividend' and 'dividendtax' types
	GetStockHoldings(userID int64) ([]models.PurchaseLot, error)
	GetOptionHoldings(userID int64) ([]models.OptionHolding, error)
	GetStockSaleDetails(userID int64) ([]models.SaleDetail, error)
	GetOptionSaleDetails(userID int64) ([]models.OptionSaleDetail, error)
}
