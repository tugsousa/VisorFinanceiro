// backend/src/services/interfaces.go
package services

import (
	"errors"
	"io"
	"time" // Adicionado para time.Month

	"github.com/username/taxfolio/backend/src/dividends"
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
	SkippedRows              []string                        `json:"SkippedRows,omitempty"` // Rows of the uploaded file that weren't imported
}

var (
	ErrParsingFailed    = errors.New("csv parsing failed")
	ErrProcessingFailed = errors.New("transaction processing failed")
)

// UploadService defines the interface for the core upload processing logic.
type UploadService interface {
	ProcessUpload(fileReader io.Reader, userID int64, portfolioID int64, source string, filename string, filesize int64) (*UploadResult, error)
	GetJobManager() *JobManager
	GetLatestUploadResult(userID int64, portfolioID int64) (*UploadResult, error)
	GetDividendTaxSummary(userID int64, portfolioID int64) (models.DividendTaxResult, error)
	GetDividendTransactions(userID int64, portfolioID int64) ([]models.ProcessedTransaction, error)
	GetStockHoldings(userID int64, portfolioID int64) (map[string][]models.PurchaseLot, error)
	GetOptionHoldings(userID int64, portfolioID int64) ([]models.OptionHolding, error)
	GetStockSaleDetails(userID int64, portfolioID int64) ([]models.SaleDetail, error)
	GetUnmatchedStockSales(userID int64, portfolioID int64) ([]models.UnmatchedSale, error)
	GetOptionSaleDetails(userID int64, portfolioID int64) ([]models.OptionSaleDetail, error)
	GetFeeDetails(userID int64, portfolioID int64) ([]models.FeeDetail, error)
	InvalidateUserCache(userID int64, portfolioID int64)
	UpdateUserPortfolioMetrics(userID int64, portfolioID int64) error
	GetCurrentHoldingsWithValue(userID int64, portfolioID int64) ([]models.HoldingWithValue, error)
	GetCurrentCashBalance(userID int64, portfolioID int64) (float64, error)
	GetHistoricalChartData(userID int64, portfolioID int64) ([]models.HistoricalDataPoint, error)

	GetDividendMetrics(userID int64, portfolioID int64) (*models.DividendMetricsResult, error)
	GetDividendCalendar(userID int64, portfolioID int64) (*DividendCalendar, error)
	SimulateStockSale(userID int64, portfolioID int64, req SaleSimulationRequest) (*SaleSimulation, error)
	GetTaxYearStatus(userID int64, portfolioID int64) (*TaxYearStatus, error)
	RebuildUserHistory(userID int64, portfolioID int64) error
	RebuildUserHistoryFrom(userID int64, portfolioID int64, fromDate string) error
	RefreshDailySnapshot(userID int64, portfolioID int64) error

	// Target allocation (allocation.go)
	GetAllocation(userID int64, portfolioID int64) (*AllocationStatus, error)
	SaveAllocationGroups(userID int64, portfolioID int64, groups []AllocationGroup) ([]AllocationGroup, error)
	SaveAllocationAssignments(userID int64, portfolioID int64, assignments []AllocationAssignment) error
	SaveAllocationSettings(userID int64, portfolioID int64, settings AllocationSettings) error
	PlanAllocationDeposit(userID int64, portfolioID int64, amountEUR float64) (*DepositPlan, error)
}

type PriceInfo struct {
	Status   string
	Price    float64
	Currency string
}

type PriceMap map[string]float64

// DividendEvent is one dividend of a listing: its ex-dividend date and the amount per share.
type DividendEvent = dividends.Event

// AnnouncedDividend is the next dividend a company has announced. PayDate is zero when not announced;
// DividendRate is the yearly rate per share (0 when unknown), in Currency.
type AnnouncedDividend struct {
	ExDate       time.Time
	PayDate      time.Time
	DividendRate float64
	Currency     string
}

// PriceService interface atualizada
type PriceService interface {
	GetCurrentPrices(isins []string) (map[string]PriceInfo, error)
	GetHistoricalPrices(ticker string) (PriceMap, string, error)
	EnsureBenchmarkData() error
	// GetLastYearDividends sums the last 12 months of dividends per share by month of the ex-date.
	GetLastYearDividends(ticker string) (map[time.Month]float64, string, error)
	// GetDividendEvents returns each dividend (ex-date, amount per share) between from and to, and the currency.
	GetDividendEvents(ticker string, from, to time.Time) ([]DividendEvent, string, error)
	// GetAnnouncedDividend returns the next announced dividend, or nil when none is announced.
	GetAnnouncedDividend(ticker string) (*AnnouncedDividend, error)
	// Métodos adicionados para paralelização
	FetchTickerForISIN(isin string) (string, string, string, error)
	FetchMetadata(ticker string) (models.AssetMetadata, error)
	FindTickerWithHistory(isin, currentTicker string) (string, PriceMap, string, error)
}
