// backend/src/services/interfaces.go
package services

import (
	"errors"
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

// Define common service errors
var (
	ErrParsingFailed    = errors.New("csv parsing failed")
	ErrProcessingFailed = errors.New("transaction processing failed")
	// ErrValidationFailed is already defined in the validation package
	// If the service layer needs to wrap it or return it directly, ensure consistency.
)

// UploadService defines the interface for the core upload processing logic.
type UploadService interface {
	ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error)
	GetLatestUploadResult(userID int64) (*UploadResult, error)
	GetDividendTaxSummary(userID int64) (models.DividendTaxResult, error)
	GetDividendTransactions(userID int64) ([]models.ProcessedTransaction, error)
	GetStockHoldings(userID int64) ([]models.PurchaseLot, error)
	GetOptionHoldings(userID int64) ([]models.OptionHolding, error)
	GetStockSaleDetails(userID int64) ([]models.SaleDetail, error)
	GetOptionSaleDetails(userID int64) ([]models.OptionSaleDetail, error)
	InvalidateUserCache(userID int64)
}
