// backend/src/services/upload_service.go
package services

import (
	"fmt"
	"io"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
)

const (
	ckLatestUploadResult   = "latest_upload_result_user_%d"
	ckStockSales           = "stock_sales_user_%d"
	ckOptionSales          = "option_sales_user_%d"
	ckDividendSummary      = "dividend_summary_user_%d"
	ckStockHoldings        = "stock_holdings_user_%d"
	ckOptionHoldings       = "option_holdings_user_%d"
	ckDividendTxns         = "dividend_txns_user_%d"
	DefaultCacheExpiration = 15 * time.Minute
	CacheCleanupInterval   = 30 * time.Minute
)

type uploadServiceImpl struct {
	csvParser             parsers.CSVParser
	transactionProcessor  parsers.TransactionProcessor
	dividendProcessor     processors.DividendProcessor
	stockProcessor        processors.StockProcessor
	optionProcessor       processors.OptionProcessor
	cashMovementProcessor processors.CashMovementProcessor
	reportCache           *cache.Cache
}

func NewUploadService(
	csvParser parsers.CSVParser,
	transactionProcessor parsers.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor,
	reportCache *cache.Cache,
) UploadService {
	return &uploadServiceImpl{
		csvParser:             csvParser,
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor,
		reportCache:           reportCache,
	}
}

func fetchUserProcessedTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	logger.L.Debug("Fetching processed transactions from DB", "userID", userID)
	rows, err := database.DB.Query(`
		SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
		       transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, 
		       order_id, exchange_rate, amount_eur, country_code, input_string, hash_id
		FROM processed_transactions
		WHERE user_id = ?
		ORDER BY date ASC, id ASC`, userID)

	if err != nil {
		logger.L.Error("Error querying transactions from DB", "userID", userID, "error", err)
		return nil, fmt.Errorf("error querying transactions for userID %d: %w", userID, err)
	}
	defer rows.Close()

	var transactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId)
		if scanErr != nil {
			logger.L.Error("Error scanning transaction row from DB", "userID", userID, "error", scanErr)
			return nil, fmt.Errorf("error scanning transaction row for userID %d: %w", userID, scanErr)
		}
		transactions = append(transactions, tx)
	}
	if err = rows.Err(); err != nil {
		logger.L.Error("Error iterating over transaction rows from DB", "userID", userID, "error", err)
		return nil, fmt.Errorf("error iterating over transaction rows for userID %d: %w", userID, err)
	}
	logger.L.Debug("Fetched transactions from DB", "userID", userID, "count", len(transactions))
	return transactions, nil
}

func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error) {
	overallStartTime := time.Now()
	logger.L.Info("ProcessUpload START", "userID", userID)

	rawTransactions, err := s.csvParser.Parse(fileReader)
	if err != nil {
		logger.L.Error("Error parsing CSV in service", "userID", userID, "error", err)
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}
	if len(rawTransactions) == 0 {
		return &UploadResult{}, nil
	}

	processedTransactions, err := s.transactionProcessor.Process(rawTransactions)
	if err != nil {
		logger.L.Error("Error processing raw transactions", "userID", userID, "error", err)
		return nil, fmt.Errorf("error processing raw transactions for userID %d: %w", userID, err)
	}
	if len(processedTransactions) == 0 {
		return &UploadResult{}, nil
	}

	dbTx, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Error beginning DB transaction for ProcessUpload", "userID", userID, "error", err)
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			dbTx.Rollback()
		}
	}()

	stmt, err := dbTx.Prepare(`
        INSERT INTO processed_transactions
        (user_id, date, source, product_name, isin, quantity, original_quantity, price,
         transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, order_id,
         exchange_rate, amount_eur, country_code, input_string, hash_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		logger.L.Error("Error preparing DB statement for ProcessUpload", "userID", userID, "error", err)
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	for _, tx := range processedTransactions {
		_, err := stmt.Exec(
			userID, tx.Date, tx.Source, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
			tx.TransactionType, tx.TransactionSubType, tx.BuySell, tx.Description, tx.Amount, tx.Currency,
			tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode, tx.InputString, tx.HashId)
		if err != nil {
			logger.L.Error("Error inserting transaction into DB", "userID", userID, "orderID", tx.OrderID, "error", err)
			return nil, fmt.Errorf("error inserting processed transaction (OrderID: %s): %w", tx.OrderID, err)
		}
	}

	if err := dbTx.Commit(); err != nil {
		logger.L.Error("Error committing DB transaction for ProcessUpload", "userID", userID, "error", err)
		return nil, fmt.Errorf("error committing processed transactions to database: %w", err)
	}
	committed = true
	logger.L.Info("Successfully stored processed transactions in DB", "userID", userID, "count", len(processedTransactions))

	s.InvalidateUserCache(userID)

	allUserTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}

	stockSaleDetails, stockHoldingsByYear := s.stockProcessor.Process(allUserTransactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(allUserTransactions)
	cashMovements := s.cashMovementProcessor.Process(allUserTransactions)

	var dividendTransactionsList []models.ProcessedTransaction
	for _, tx := range allUserTransactions {
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

	logger.L.Info("ProcessUpload END", "userID", userID, "duration", time.Since(overallStartTime))
	return result, nil
}

// All other Get... methods in the service remain the same, as they call `fetchUserProcessedTransactions`
// which now retrieves the correct data.
// ... (the rest of the file remains the same)
func (s *uploadServiceImpl) InvalidateUserCache(userID int64) {
	keysToDelete := []string{
		fmt.Sprintf(ckLatestUploadResult, userID),
		fmt.Sprintf(ckStockSales, userID),
		fmt.Sprintf(ckOptionSales, userID),
		fmt.Sprintf(ckDividendSummary, userID),
		fmt.Sprintf(ckStockHoldings, userID),
		fmt.Sprintf(ckOptionHoldings, userID),
		fmt.Sprintf(ckDividendTxns, userID),
	}
	for _, key := range keysToDelete {
		s.reportCache.Delete(key)
	}
	logger.L.Info("Invalidated all caches for user", "userID", userID)
}

func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	cacheKey := fmt.Sprintf(ckLatestUploadResult, userID)
	if cachedResult, found := s.reportCache.Get(cacheKey); found {
		if result, ok := cachedResult.(*UploadResult); ok {
			logger.L.Info("Cache hit for GetLatestUploadResult", "userID", userID, "cacheKey", cacheKey)
			return result, nil
		}
		logger.L.Warn("Cache data type mismatch for GetLatestUploadResult", "userID", userID, "cacheKey", cacheKey)
	}

	logger.L.Info("Cache miss for GetLatestUploadResult, computing...", "userID", userID, "cacheKey", cacheKey)
	overallStartTime := time.Now()

	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}

	if len(userTransactions) == 0 {
		logger.L.Info("No transactions found for user, returning empty result", "userID", userID)
		emptyResult := &UploadResult{
			StockSaleDetails:         []models.SaleDetail{},
			StockHoldings:            make(map[string][]models.PurchaseLot),
			OptionSaleDetails:        []models.OptionSaleDetail{},
			OptionHoldings:           []models.OptionHolding{},
			CashMovements:            []models.CashMovement{},
			DividendTransactionsList: []models.ProcessedTransaction{},
		}
		s.reportCache.Set(cacheKey, emptyResult, DefaultCacheExpiration)
		return emptyResult, nil
	}

	processingStartTime := time.Now()
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(userTransactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(userTransactions)
	cashMovements := s.cashMovementProcessor.Process(userTransactions)

	var dividendTransactionsList []models.ProcessedTransaction
	for _, tx := range userTransactions {
		if tx.TransactionType == "DIVIDEND" {
			dividendTransactionsList = append(dividendTransactionsList, tx)
		}
	}
	logger.L.Debug("Processing complete for GetLatestUploadResult", "userID", userID, "duration", time.Since(processingStartTime))

	uploadResult := &UploadResult{
		StockSaleDetails:         stockSaleDetails,
		StockHoldings:            stockHoldings,
		OptionSaleDetails:        optionSaleDetails,
		OptionHoldings:           optionHoldings,
		CashMovements:            cashMovements,
		DividendTransactionsList: dividendTransactionsList,
	}

	s.reportCache.Set(cacheKey, uploadResult, DefaultCacheExpiration)
	logger.L.Info("Computed and cached GetLatestUploadResult", "userID", userID, "cacheKey", cacheKey, "duration", time.Since(overallStartTime))
	return uploadResult, nil
}

func (s *uploadServiceImpl) GetDividendTaxSummary(userID int64) (models.DividendTaxResult, error) {
	cacheKey := fmt.Sprintf(ckDividendSummary, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		if summary, ok := data.(models.DividendTaxResult); ok {
			logger.L.Info("Cache hit for GetDividendTaxSummary", "userID", userID)
			return summary, nil
		}
	}
	logger.L.Info("Cache miss for GetDividendTaxSummary, computing...", "userID", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	summary := s.dividendProcessor.CalculateTaxSummary(userTransactions)
	s.reportCache.Set(cacheKey, summary, DefaultCacheExpiration)
	return summary, nil
}

func (s *uploadServiceImpl) GetStockSaleDetails(userID int64) ([]models.SaleDetail, error) {
	cacheKey := fmt.Sprintf(ckStockSales, userID)
	if cachedData, found := s.reportCache.Get(cacheKey); found {
		if sales, ok := cachedData.([]models.SaleDetail); ok {
			logger.L.Info("Cache hit for GetStockSaleDetails", "userID", userID)
			return sales, nil
		}
	}
	logger.L.Info("Cache miss for GetStockSaleDetails, computing...", "userID", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	stockSaleDetails, _ := s.stockProcessor.Process(userTransactions)
	s.reportCache.Set(cacheKey, stockSaleDetails, DefaultCacheExpiration)
	return stockSaleDetails, nil
}

func (s *uploadServiceImpl) GetDividendTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	cacheKey := fmt.Sprintf(ckDividendTxns, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		if txns, ok := data.([]models.ProcessedTransaction); ok {
			logger.L.Info("Cache hit for GetDividendTransactions", "userID", userID)
			return txns, nil
		}
	}
	logger.L.Info("Cache miss for GetDividendTransactions, computing...", "userID", userID)
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
	s.reportCache.Set(cacheKey, dividends, DefaultCacheExpiration)
	return dividends, nil
}

func (s *uploadServiceImpl) GetStockHoldings(userID int64) ([]models.PurchaseLot, error) {
	cacheKey := fmt.Sprintf(ckStockHoldings, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		if holdings, ok := data.([]models.PurchaseLot); ok {
			logger.L.Info("Cache hit for GetStockHoldings", "userID", userID)
			return holdings, nil
		}
	}
	logger.L.Info("Cache miss for GetStockHoldings, computing...", "userID", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	_, stockHoldingsByYear := s.stockProcessor.Process(userTransactions)
	latestYear := ""
	for year := range stockHoldingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	latestHoldings := stockHoldingsByYear[latestYear]
	if latestHoldings == nil {
		latestHoldings = []models.PurchaseLot{}
	}
	s.reportCache.Set(cacheKey, latestHoldings, DefaultCacheExpiration)
	return latestHoldings, nil
}

func (s *uploadServiceImpl) GetOptionHoldings(userID int64) ([]models.OptionHolding, error) {
	cacheKey := fmt.Sprintf(ckOptionHoldings, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		if holdings, ok := data.([]models.OptionHolding); ok {
			logger.L.Info("Cache hit for GetOptionHoldings", "userID", userID)
			return holdings, nil
		}
	}
	logger.L.Info("Cache miss for GetOptionHoldings, computing...", "userID", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	_, optionHoldings := s.optionProcessor.Process(userTransactions)
	s.reportCache.Set(cacheKey, optionHoldings, DefaultCacheExpiration)
	return optionHoldings, nil
}

func (s *uploadServiceImpl) GetOptionSaleDetails(userID int64) ([]models.OptionSaleDetail, error) {
	cacheKey := fmt.Sprintf(ckOptionSales, userID)
	if data, found := s.reportCache.Get(cacheKey); found {
		if sales, ok := data.([]models.OptionSaleDetail); ok {
			logger.L.Info("Cache hit for GetOptionSaleDetails", "userID", userID)
			return sales, nil
		}
	}
	logger.L.Info("Cache miss for GetOptionSaleDetails, computing...", "userID", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	optionSaleDetails, _ := s.optionProcessor.Process(userTransactions)
	s.reportCache.Set(cacheKey, optionSaleDetails, DefaultCacheExpiration)
	return optionSaleDetails, nil
}
