// backend/src/services/interfaces.go
package services

import (
	"errors"
	"io"

	"github.com/username/taxfolio/backend/src/models"
)

// UploadResult is primarily for the result of a single ProcessUpload call.
type UploadResult struct {
	StockSaleDetails         []models.SaleDetail             `json:"StockSaleDetails"`
	StockHoldings            map[string][]models.PurchaseLot `json:"StockHoldings"`
	OptionSaleDetails        []models.OptionSaleDetail       `json:"OptionSaleDetails"`
	OptionHoldings           []models.OptionHolding          `json:"OptionHoldings"`
	CashMovements            []models.CashMovement           `json:"CashMovements"`
	DividendTransactionsList []models.ProcessedTransaction   `json:"DividendTransactionsList"`
	FeeDetails               []models.FeeDetail              `json:"FeeDetails"`
}

var (
	ErrParsingFailed    = errors.New("csv parsing failed")
	ErrProcessingFailed = errors.New("transaction processing failed")
)

// UploadService defines the interface for the core upload processing logic.
// UPDATED: All methods now require portfolioID.
type UploadService interface {
	ProcessUpload(fileReader io.Reader, userID int64, portfolioID int64, source string, filename string, filesize int64) (*UploadResult, error)
	GetLatestUploadResult(userID int64, portfolioID int64) (*UploadResult, error)
	GetDividendTaxSummary(userID int64, portfolioID int64) (models.DividendTaxResult, error)
	GetDividendTransactions(userID int64, portfolioID int64) ([]models.ProcessedTransaction, error)
	GetStockHoldings(userID int64, portfolioID int64) (map[string][]models.PurchaseLot, error)
	GetOptionHoldings(userID int64, portfolioID int64) ([]models.OptionHolding, error)
	GetStockSaleDetails(userID int64, portfolioID int64) ([]models.SaleDetail, error)
	GetOptionSaleDetails(userID int64, portfolioID int64) ([]models.OptionSaleDetail, error)
	GetFeeDetails(userID int64, portfolioID int64) ([]models.FeeDetail, error)
	InvalidateUserCache(userID int64, portfolioID int64)
	UpdateUserPortfolioMetrics(userID int64, portfolioID int64) error
	GetCurrentHoldingsWithValue(userID int64, portfolioID int64) ([]models.HoldingWithValue, error)
	GetHistoricalChartData(userID int64, portfolioID int64) ([]models.HistoricalDataPoint, error)

	// RebuildUserHistory recalculates daily portfolio snapshots for the entire history.
	RebuildUserHistory(userID int64, portfolioID int64) error
}

type PriceInfo struct {
	Status   string
	Price    float64
	Currency string
}

type PriceMap map[string]float64

type PriceService interface {
	GetCurrentPrices(isins []string) (map[string]PriceInfo, error)
	GetHistoricalPrices(ticker string) (PriceMap, string, error)
	EnsureBenchmarkData() error
}
