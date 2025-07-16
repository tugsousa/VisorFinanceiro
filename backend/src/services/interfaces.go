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
	StockSaleDetails         []models.SaleDetail             `json:"StockSaleDetails"`
	StockHoldings            map[string][]models.PurchaseLot `json:"StockHoldings"`
	OptionSaleDetails        []models.OptionSaleDetail       `json:"OptionSaleDetails"`
	OptionHoldings           []models.OptionHolding          `json:"OptionHoldings"`
	CashMovements            []models.CashMovement           `json:"CashMovements"`
	DividendTransactionsList []models.ProcessedTransaction   `json:"DividendTransactionsList"`
}

// Define common service errors
var (
	ErrParsingFailed    = errors.New("csv parsing failed")
	ErrProcessingFailed = errors.New("transaction processing failed")
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
