// backend/src/services/upload_service.go
package services

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
)

// ... (constants remain the same) ...

const (
	// Long-lived caches for full calculation results
	ckAllStockSales       = "res_all_stock_sales_user_%d"
	ckStockHoldingsByYear = "res_stock_holdings_by_year_user_%d"
	ckAllFeeDetails       = "res_all_fee_details_user_%d"
	// TODO: Add result caches for options and dividends when they are refactored

	// Short-lived, aggregate cache
	ckLatestUploadResult = "agg_latest_upload_result_user_%d"
	ckDividendSummary    = "agg_dividend_summary_user_%d"

	DefaultCacheExpiration = 15 * time.Minute
	CacheCleanupInterval   = 30 * time.Minute
)

// START OF MODIFICATION
// Add priceService to the implementation struct
type uploadServiceImpl struct {
	transactionProcessor  *processors.TransactionProcessor
	dividendProcessor     processors.DividendProcessor
	stockProcessor        processors.StockProcessor
	optionProcessor       processors.OptionProcessor
	cashMovementProcessor processors.CashMovementProcessor
	feeProcessor          processors.FeeProcessor
	priceService          PriceService // Added this field
	reportCache           *cache.Cache
}

// Update the constructor to accept the priceService
func NewUploadService(
	transactionProcessor *processors.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor,
	feeProcessor processors.FeeProcessor,
	priceService PriceService, // Added this parameter
	reportCache *cache.Cache,
) UploadService {
	return &uploadServiceImpl{
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor,
		feeProcessor:          feeProcessor,
		priceService:          priceService, // Assign the service
		reportCache:           reportCache,
	}
}

// END OF MODIFICATION

// Modified ProcessUpload signature to accept filename and size for history tracking
func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64, source, filename string, filesize int64) (*UploadResult, error) {
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

	// --- Database Transaction ---
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

	insertedCount := 0
	for _, tx := range newlyProcessedTxs {
		_, err := stmt.Exec(userID, tx.Date, tx.Source, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price, tx.TransactionType, tx.TransactionSubType, tx.BuySell, tx.Description, tx.Amount, tx.Currency, tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode, tx.InputString, tx.HashId)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				logger.L.Debug("Skipping duplicate transaction on upload", "userID", userID, "hash_id", tx.HashId)
				continue
			}
			return nil, fmt.Errorf("error inserting transaction (OrderID: %s): %w", tx.OrderID, err)
		}
		insertedCount++
	}

	// --- NEW: Update User and Upload History ---
	if insertedCount > 0 {
		// 1. Record this specific upload event
		_, err = dbTx.Exec(`
			INSERT INTO uploads_history (user_id, source, filename, file_size, transaction_count) 
			VALUES (?, ?, ?, ?, ?)`,
			userID, source, filename, filesize, insertedCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to record upload in history: %w", err)
		}

		// 2. Recalculate distinct sources and update user stats
		var newUploadCount int
		err = dbTx.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ?", userID).Scan(&newUploadCount)
		if err != nil {
			return nil, fmt.Errorf("failed to recount distinct sources for user: %w", err)
		}

		// 3. Update the user's main counters
		_, err = dbTx.Exec(`
			UPDATE users 
			SET total_upload_count = total_upload_count + 1, upload_count = ?
			WHERE id = ?`,
			newUploadCount, userID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to update user upload counts: %w", err)
		}
	}
	// --- END NEW ---

	if err := dbTx.Commit(); err != nil {
		return nil, fmt.Errorf("error committing transactions: %w", err)
	}

	// START OF MODIFICATION
	// After a successful upload and commit, trigger the portfolio metrics update.
	// We run this in a goroutine so it doesn't block the HTTP response to the user.
	if insertedCount > 0 {
		go func() {
			logger.L.Info("Triggering portfolio metrics update after upload", "userID", userID)
			// Invalidate first to ensure the next calculation uses fresh DB data
			s.InvalidateUserCache(userID)
			if err := s.updateUserPortfolioMetrics(userID); err != nil {
				logger.L.Error("Failed to update user portfolio metrics asynchronously", "userID", userID, "error", err)
			}
		}()
	} else {
		s.InvalidateUserCache(userID)
	}
	// END OF MODIFICATION

	logger.L.Info("ProcessUpload END", "userID", userID, "duration", time.Since(overallStartTime))
	return s.GetLatestUploadResult(userID)
}

// START OF NEW FUNCTION
// updateUserPortfolioMetrics calculates and updates the user's portfolio value and top holdings.
func (s *uploadServiceImpl) updateUserPortfolioMetrics(userID int64) error {
	logger.L.Debug("Starting portfolio metrics calculation", "userID", userID)

	// 1. Get current stock holdings. This will use the cache if available.
	_, holdingsByYear, err := s.getStockData(userID)
	if err != nil {
		return fmt.Errorf("could not get stock holdings for metrics update: %w", err)
	}

	// Find the latest year's holdings for the current portfolio snapshot.
	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	currentLots := holdingsByYear[latestYear]
	if len(currentLots) == 0 {
		logger.L.Info("User has no current holdings, setting portfolio value to 0", "userID", userID)
		_, err := database.DB.Exec("UPDATE users SET portfolio_value_eur = 0, top_5_holdings = '[]' WHERE id = ?", userID)
		return err
	}

	// 2. Aggregate holdings by ISIN to get total quantities.
	type aggregatedHolding struct {
		ISIN        string
		ProductName string
		Quantity    int
	}
	groupedHoldings := make(map[string]aggregatedHolding)
	for _, lot := range currentLots {
		agg, exists := groupedHoldings[lot.ISIN]
		if !exists {
			agg = aggregatedHolding{ISIN: lot.ISIN, ProductName: lot.ProductName}
		}
		agg.Quantity += lot.Quantity
		groupedHoldings[lot.ISIN] = agg
	}

	// 3. Get current prices.
	uniqueISINs := make([]string, 0, len(groupedHoldings))
	for isin := range groupedHoldings {
		uniqueISINs = append(uniqueISINs, isin)
	}
	prices, err := s.priceService.GetCurrentPrices(uniqueISINs)
	if err != nil {
		// Log as a warning because some prices might fail, but we can proceed with what we have.
		logger.L.Warn("Could not fetch all prices for metrics update", "userID", userID, "error", err)
	}

	// 4. Calculate market value and total portfolio value.
	type holdingWithValue struct {
		Name  string  `json:"name"`
		Value float64 `json:"value"`
	}
	var valuedHoldings []holdingWithValue
	totalPortfolioValue := 0.0

	for isin, holding := range groupedHoldings {
		priceInfo, found := prices[isin]
		if found && priceInfo.Status == "OK" {
			marketValue := priceInfo.Price * float64(holding.Quantity)
			totalPortfolioValue += marketValue
			valuedHoldings = append(valuedHoldings, holdingWithValue{
				Name:  holding.ProductName,
				Value: marketValue,
			})
		}
	}

	// 5. Sort to find top 5 holdings.
	sort.Slice(valuedHoldings, func(i, j int) bool {
		return valuedHoldings[i].Value > valuedHoldings[j].Value
	})

	top5 := valuedHoldings
	if len(top5) > 5 {
		top5 = top5[:5]
	}

	// 6. Marshal top 5 to JSON.
	top5JSON, err := json.Marshal(top5)
	if err != nil {
		return fmt.Errorf("failed to marshal top 5 holdings to JSON: %w", err)
	}

	// 7. Update the database.
	logger.L.Info("Updating user portfolio metrics in DB", "userID", userID, "portfolioValue", totalPortfolioValue, "top5Count", len(top5))
	_, err = database.DB.Exec(
		"UPDATE users SET portfolio_value_eur = ?, top_5_holdings = ? WHERE id = ?",
		totalPortfolioValue, string(top5JSON), userID,
	)
	if err != nil {
		return fmt.Errorf("failed to update users table with portfolio metrics: %w", err)
	}

	logger.L.Debug("Successfully updated portfolio metrics", "userID", userID)
	return nil
}

// END OF NEW FUNCTION

// ... (rest of file is unchanged) ...
func (s *uploadServiceImpl) InvalidateUserCache(userID int64) {
	keysToDelete := []string{
		fmt.Sprintf(ckAllStockSales, userID),
		fmt.Sprintf(ckStockHoldingsByYear, userID),
		fmt.Sprintf(ckLatestUploadResult, userID),
		fmt.Sprintf(ckDividendSummary, userID),
		fmt.Sprintf(ckAllFeeDetails, userID),
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
	feeDetails := s.feeProcessor.Process(allTxns)

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
		FeeDetails:               feeDetails,
	}
	s.reportCache.Set(cacheKey, result, DefaultCacheExpiration)
	return result, nil
}

func (s *uploadServiceImpl) GetFeeDetails(userID int64) ([]models.FeeDetail, error) {
	cacheKey := fmt.Sprintf(ckAllFeeDetails, userID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		logger.L.Debug("Cache hit for fee details", "userID", userID)
		return cached.([]models.FeeDetail), nil
	}

	logger.L.Info("Cache miss for fee details, recalculating from DB", "userID", userID)
	allUserTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}

	// The fee processor does the heavy lifting.
	feeDetails := s.feeProcessor.Process(allUserTransactions)

	// Set the cache for subsequent requests.
	s.reportCache.Set(cacheKey, feeDetails, cache.NoExpiration)
	logger.L.Info("Populated fee details cache from DB", "userID", userID)

	return feeDetails, nil
}

func (s *uploadServiceImpl) GetStockSaleDetails(userID int64) ([]models.SaleDetail, error) {
	sales, _, err := s.getStockData(userID)
	return sales, err
}

func (s *uploadServiceImpl) GetStockHoldings(userID int64) (map[string][]models.PurchaseLot, error) {
	_, holdingsByYear, err := s.getStockData(userID)
	if err != nil {
		return nil, err
	}
	return holdingsByYear, nil
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
