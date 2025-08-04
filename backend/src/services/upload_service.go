// backend/src/services/upload_service.go
package services

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
)

const (
	// Long-lived caches for full calculation results
	ckAllStockSales       = "res_all_stock_sales_user_%d"
	ckStockHoldingsByYear = "res_stock_holdings_by_year_user_%d"

	// TODO: Add result caches for options and dividends when they are refactored

	// Short-lived, aggregate cache
	ckLatestUploadResult = "agg_latest_upload_result_user_%d"
	ckDividendSummary    = "agg_dividend_summary_user_%d"

	DefaultCacheExpiration = 15 * time.Minute
	CacheCleanupInterval   = 30 * time.Minute
)

type uploadServiceImpl struct {
	transactionProcessor  *processors.TransactionProcessor
	dividendProcessor     processors.DividendProcessor
	stockProcessor        processors.StockProcessor
	optionProcessor       processors.OptionProcessor
	cashMovementProcessor processors.CashMovementProcessor
	reportCache           *cache.Cache
}

func NewUploadService(
	transactionProcessor *processors.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor,
	reportCache *cache.Cache,
) UploadService {
	return &uploadServiceImpl{
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor,
		reportCache:           reportCache,
	}
}

func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64, source string) (*UploadResult, error) {
	overallStartTime := time.Now()
	logger.L.Info("ProcessUpload START", "userID", userID, "source", source)

	parser, err := parsers.GetParser(source)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	canonicalTxs, err := parser.Parse(fileReader)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	newlyProcessedTxs := s.transactionProcessor.Process(canonicalTxs)
	if len(newlyProcessedTxs) == 0 {
		return s.GetLatestUploadResult(userID)
	}

	// --- Database Insertion ---
	dbTx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	defer dbTx.Rollback()

	stmt, err := dbTx.Prepare(`INSERT INTO processed_transactions (user_id, date, source, product_name, isin, quantity, original_quantity, price, transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	for _, tx := range newlyProcessedTxs {
		_, err := stmt.Exec(userID, tx.Date, tx.Source, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price, tx.TransactionType, tx.TransactionSubType, tx.BuySell, tx.Description, tx.Amount, tx.Currency, tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode, tx.InputString, tx.HashId)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				logger.L.Debug("Skipping duplicate transaction on upload", "userID", userID, "hash_id", tx.HashId)
				continue
			}
			return nil, fmt.Errorf("error inserting transaction (OrderID: %s): %w", tx.OrderID, err)
		}
	}

	if err := dbTx.Commit(); err != nil {
		return nil, fmt.Errorf("error committing transactions: %w", err)
	}

	// --- Invalidate Caches ---
	// This simple strategy ensures data consistency. The next request will trigger a full, correct recalculation.
	s.InvalidateUserCache(userID)

	logger.L.Info("ProcessUpload END", "userID", userID, "duration", time.Since(overallStartTime))
	return s.GetLatestUploadResult(userID)
}

// InvalidateUserCache clears all cached data for a user, forcing a complete rebuild on the next request.
func (s *uploadServiceImpl) InvalidateUserCache(userID int64) {
	keysToDelete := []string{
		fmt.Sprintf(ckAllStockSales, userID),
		fmt.Sprintf(ckStockHoldingsByYear, userID),
		fmt.Sprintf(ckLatestUploadResult, userID),
		fmt.Sprintf(ckDividendSummary, userID),
	}
	for _, key := range keysToDelete {
		s.reportCache.Delete(key)
	}
	logger.L.Info("Invalidated all caches for user", "userID", userID)
}

// getStockData is the central function to populate stock-related caches on a cache miss.
func (s *uploadServiceImpl) getStockData(userID int64) ([]models.SaleDetail, map[string][]models.PurchaseLot, error) {
	salesCacheKey := fmt.Sprintf(ckAllStockSales, userID)
	holdingsByYearCacheKey := fmt.Sprintf(ckStockHoldingsByYear, userID)

	if cachedSales, salesFound := s.reportCache.Get(salesCacheKey); salesFound {
		if cachedHoldings, holdingsFound := s.reportCache.Get(holdingsByYearCacheKey); holdingsFound {
			logger.L.Debug("Cache hit for all stock data", "userID", userID)
			return cachedSales.([]models.SaleDetail), cachedHoldings.(map[string][]models.PurchaseLot), nil
		}
	}

	logger.L.Info("Cache miss for stock data, recalculating from DB", "userID", userID)
	allUserTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, nil, err
	}

	// The processor does the heavy lifting of calculating everything in one pass.
	allSales, holdingsByYear := s.stockProcessor.Process(allUserTransactions)

	s.reportCache.Set(salesCacheKey, allSales, cache.NoExpiration)
	s.reportCache.Set(holdingsByYearCacheKey, holdingsByYear, cache.NoExpiration)
	logger.L.Info("Populated stock result caches from DB", "userID", userID)

	return allSales, holdingsByYear, nil
}

func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	cacheKey := fmt.Sprintf(ckLatestUploadResult, userID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		logger.L.Info("Cache hit for GetLatestUploadResult", "userID", userID)
		return cached.(*UploadResult), nil
	}
	logger.L.Info("Cache miss for GetLatestUploadResult, computing...", "userID", userID)

	stockSaleDetails, stockHoldingsByYear, err := s.getStockData(userID)
	if err != nil {
		return nil, err
	}

	allTxns, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}

	optionSaleDetails, optionHoldings := s.optionProcessor.Process(allTxns)
	cashMovements := s.cashMovementProcessor.Process(allTxns)
	var dividendTransactionsList []models.ProcessedTransaction
	for _, tx := range allTxns {
		if tx.TransactionType == "DIVIDEND" {
			dividendTransactionsList = append(dividendTransactionsList, tx)
		}
	}

	result := &UploadResult{
		StockSaleDetails:         stockSaleDetails,
		StockHoldings:            stockHoldingsByYear,
		OptionSaleDetails:        optionSaleDetails,
		OptionHoldings:           optionHoldings,
		CashMovements:            cashMovements,
		DividendTransactionsList: dividendTransactionsList,
	}
	s.reportCache.Set(cacheKey, result, DefaultCacheExpiration)
	return result, nil
}

func (s *uploadServiceImpl) GetStockSaleDetails(userID int64) ([]models.SaleDetail, error) {
	sales, _, err := s.getStockData(userID)
	return sales, err
}

func (s *uploadServiceImpl) GetStockHoldings(userID int64) ([]models.PurchaseLot, error) {
	_, holdingsByYear, err := s.getStockData(userID)
	if err != nil {
		return nil, err
	}

	// Find the latest year in the map to return the most current holdings.
	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}

	if latestHoldings, ok := holdingsByYear[latestYear]; ok {
		return latestHoldings, nil
	}

	return []models.PurchaseLot{}, nil // Return empty slice if no holdings found
}

// --- Other methods remain largely unchanged, but will benefit from future refactoring ---

func (s *uploadServiceImpl) GetDividendTaxSummary(userID int64) (models.DividendTaxResult, error) {
	cacheKey := fmt.Sprintf(ckDividendSummary, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		return data.(models.DividendTaxResult), nil
	}
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	summary := s.dividendProcessor.CalculateTaxSummary(userTransactions)
	s.reportCache.Set(cacheKey, summary, DefaultCacheExpiration)
	return summary, nil
}

func (s *uploadServiceImpl) GetOptionSaleDetails(userID int64) ([]models.OptionSaleDetail, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	optionSaleDetails, _ := s.optionProcessor.Process(userTransactions)
	return optionSaleDetails, nil
}

func (s *uploadServiceImpl) GetOptionHoldings(userID int64) ([]models.OptionHolding, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	_, optionHoldings := s.optionProcessor.Process(userTransactions)
	return optionHoldings, nil
}

func (s *uploadServiceImpl) GetDividendTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	var dividends []models.ProcessedTransaction
	for _, tx := range userTransactions {
		if tx.TransactionType == "DIVIDEND" {
			dividends = append(dividends, tx)
		}
	}
	return dividends, nil
}

// fetchUserProcessedTransactions remains the same
func fetchUserProcessedTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	logger.L.Debug("Fetching processed transactions from DB", "userID", userID)
	rows, err := database.DB.Query(`SELECT id, date, source, product_name, isin, quantity, original_quantity, price, transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id FROM processed_transactions WHERE user_id = ? ORDER BY date ASC, id ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("error querying transactions for userID %d: %w", userID, err)
	}
	defer rows.Close()
	var transactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price, &tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency, &tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId)
		if scanErr != nil {
			return nil, fmt.Errorf("error scanning transaction row for userID %d: %w", userID, scanErr)
		}
		transactions = append(transactions, tx)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over transaction rows for userID %d: %w", userID, err)
	}
	logger.L.Info("DB fetch complete.", "userID", userID, "transactionCount", len(transactions))
	return transactions, nil
}
