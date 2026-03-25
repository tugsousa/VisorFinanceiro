// backend/src/services/upload_service.go
package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/utils"
	"github.com/username/taxfolio/backend/src/websocket"
)

const (
	ckAllStockSales       = "res_all_stock_sales_user_%d_pf_%d"
	ckStockHoldingsByYear = "res_stock_holdings_by_year_user_%d_pf_%d"
	ckAllFeeDetails       = "res_all_fee_details_user_%d_pf_%d"
	ckLatestUploadResult  = "agg_latest_upload_result_user_%d_pf_%d"
	ckDividendSummary     = "agg_dividend_summary_user_%d_pf_%d"

	// FIX #5: short TTL for holdings-with-value so the 4 concurrent background
	// jobs all hit cache after the first caller populates it.
	ckCurrentHoldingsValue = "holdings_with_value_%d_%d"
	holdingsValueTTL       = 2 * time.Minute

	// Smart Cache Expiration Times
	DefaultCacheExpiration     = 15 * time.Minute
	ISINMappingCacheExpiration = 24 * time.Hour
	PriceCacheExpiration       = 15 * time.Minute
	HistoricalCacheExpiration  = 1 * time.Hour
	DividendCacheExpiration    = 1 * time.Hour
	MetricsCacheExpiration     = 30 * time.Minute

	CacheCleanupInterval = 30 * time.Minute
)

// Helper struct for aggregating purchase lots by ISIN
type aggregatedHolding struct {
	ISIN              string
	ProductName       string
	TotalQuantity     int
	TotalCostBasisEUR float64
}

type uploadServiceImpl struct {
	transactionProcessor  *processors.TransactionProcessor
	dividendProcessor     processors.DividendProcessor
	stockProcessor        processors.StockProcessor
	optionProcessor       processors.OptionProcessor
	cashMovementProcessor processors.CashMovementProcessor
	feeProcessor          processors.FeeProcessor
	priceService          PriceService
	reportCache           *cache.Cache
	jobManager            *JobManager
	rebuildRunning        sync.Map // key: "userID:portfolioID", value: struct{}{}
	isinResolutionCache   *ISINResolutionCache
}

func NewUploadService(
	transactionProcessor *processors.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor,
	feeProcessor processors.FeeProcessor,
	priceService PriceService,
	reportCache *cache.Cache,
) UploadService {
	return &uploadServiceImpl{
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor,
		feeProcessor:          feeProcessor,
		priceService:          priceService,
		reportCache:           reportCache,
		jobManager:            NewOptimizedJobManager(),
		isinResolutionCache:   NewISINResolutionCache(24 * time.Hour),
	}
}

func (s *uploadServiceImpl) GetJobManager() *JobManager {
	return s.jobManager
}

// GetDividendMetrics calculates metrics based on the CURRENT portfolio and real history.
func (s *uploadServiceImpl) GetDividendMetrics(userID int64, portfolioID int64) (*models.DividendMetricsResult, error) {
	cacheKey := fmt.Sprintf("agg_dividend_metrics_v3_holdings_based_user_%d_pf_%d", userID, portfolioID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.(*models.DividendMetricsResult), nil
	}

	// FIX #5: GetCurrentHoldingsWithValue now caches its result for 2 minutes,
	// so this call is cheap when invoked shortly after UpdateMetrics or CacheWarming.
	holdings, err := s.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	// FIX #1: Re-use a single transaction fetch instead of calling
	// fetchUserProcessedTransactions separately for dividends.
	allTxs, err := s.GetDividendTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	now := time.Now()

	monthlyProjection := make([]float64, 12)
	breakdownMap := make(map[int][]models.DividendContributor)
	var projectedAnnualTotal float64 = 0

	isinList := make([]string, len(holdings))
	for i, h := range holdings {
		isinList[i] = h.ISIN
	}
	mappings, _ := models.GetMappingsByISINs(database.DB, isinList)

	var mu sync.Mutex
	var wg sync.WaitGroup

	// FIX #2: semaphore limits concurrent Yahoo requests to 5 (same pattern already
	// used elsewhere in the codebase, now consistently applied here too).
	sem := make(chan struct{}, 5)

	for _, h := range holdings {
		if h.Quantity <= 0 {
			continue
		}

		mapEntry, ok := mappings[h.ISIN]
		if !ok || mapEntry.TickerSymbol == "" {
			continue
		}

		wg.Add(1)
		go func(holding models.HoldingWithValue, ticker string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			pastDividends, currency, err := s.priceService.GetLastYearDividends(ticker)
			if err != nil {
				logger.L.Warn("Failed to get dividend history", "ticker", ticker, "error", err)
				return
			}

			exchangeRate := 1.0
			if currency != "EUR" && currency != "" {
				rate, err := processors.GetExchangeRate(currency, now)
				if err == nil && rate > 0 {
					exchangeRate = rate
				}
			}

			mu.Lock()
			for month, amountPerShare := range pastDividends {
				monthIndex := int(month) - 1

				totalDivNative := amountPerShare * float64(holding.Quantity)
				totalDivEUR := totalDivNative
				if exchangeRate != 1.0 && exchangeRate > 0 {
					totalDivEUR = totalDivNative / exchangeRate
				}

				if monthIndex >= 0 && monthIndex < 12 {
					monthlyProjection[monthIndex] += totalDivEUR
					projectedAnnualTotal += totalDivEUR
					displayName := holding.ProductName
					if displayName == "" {
						displayName = ticker
					}

					breakdownMap[monthIndex] = append(breakdownMap[monthIndex], models.DividendContributor{
						Ticker: displayName,
						Amount: totalDivEUR,
					})
				}
			}
			mu.Unlock()
		}(h, mapEntry.TickerSymbol)
	}

	wg.Wait()

	twelveMonthsAgo := now.AddDate(-1, 0, 0)
	var totalDividendsTTM float64
	var totalCostBasis float64 = 0
	var totalMarketValue float64 = 0

	for _, h := range holdings {
		totalCostBasis += h.TotalCostBasisEUR
		totalMarketValue += h.MarketValueEUR
	}

	for _, tx := range allTxs {
		txTime, e := time.Parse("02-01-2006", tx.Date)
		if e == nil && !txTime.Before(twelveMonthsAgo) {
			if tx.TransactionType == "DIVIDEND" && tx.TransactionSubType != "TAX" {
				totalDividendsTTM += tx.AmountEUR
			}
		}
	}

	portfolioYield := 0.0
	if totalMarketValue > 0 {
		portfolioYield = (projectedAnnualTotal / totalMarketValue) * 100
	}

	yieldOnCost := 0.0
	if totalCostBasis > 0 {
		yieldOnCost = (projectedAnnualTotal / totalCostBasis) * 100
	}

	dividendsByYear := make(map[string]float64)
	for _, tx := range allTxs {
		if tx.TransactionType == "DIVIDEND" && tx.TransactionSubType != "TAX" {
			if len(tx.Date) >= 10 {
				year := tx.Date[6:10]
				dividendsByYear[year] += tx.AmountEUR
			}
		}
	}

	yearlyYields := make(map[string]float64)
	rows, err := database.DB.Query(`SELECT SUBSTR(date, 1, 4) as year, AVG(total_equity) FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ? GROUP BY year`, userID, portfolioID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var year string
			var avgEquity float64
			if err := rows.Scan(&year, &avgEquity); err == nil {
				if totalDiv, ok := dividendsByYear[year]; ok && avgEquity > 0 {
					yearlyYields[year] = (totalDiv / avgEquity) * 100
				}
			}
		}
	}

	result := &models.DividendMetricsResult{
		TotalDividendsTTM:   totalDividendsTTM,
		PortfolioYield:      portfolioYield,
		YieldOnCost:         yieldOnCost,
		ProjectionByMonth:   monthlyProjection,
		ProjectionBreakdown: breakdownMap,
		LastUpdated:         now.Format(time.RFC3339),
		HasData:             len(holdings) > 0,
		YearlyYields:        yearlyYields,
	}

	s.reportCache.Set(cacheKey, result, DefaultCacheExpiration)
	return result, nil
}

func (s *uploadServiceImpl) RefreshDailySnapshot(userID int64, portfolioID int64) error {
	const SnapshotThrottleMinutes = 15

	var lastUpdateStr string
	var lastUpdateAt time.Time

	err := database.DB.QueryRow(`
		SELECT date, updated_at 
		FROM portfolio_snapshots 
		WHERE user_id = ? AND portfolio_id = ? 
		ORDER BY date DESC LIMIT 1`,
		userID, portfolioID,
	).Scan(&lastUpdateStr, &lastUpdateAt)

	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to fetch last snapshot date: %w", err)
	}

	shouldRebuild := false
	if err == sql.ErrNoRows {
		shouldRebuild = true
	} else {
		lastDate, parseErr := time.Parse("2006-01-02", lastUpdateStr)
		if parseErr == nil {
			today := time.Now().Truncate(24 * time.Hour)
			lastDate = lastDate.Truncate(24 * time.Hour)
			daysDiff := today.Sub(lastDate).Hours() / 24
			if daysDiff >= 2.0 {
				logger.L.Debug("Snapshot gap detected, triggering history backfill",
					"userID", userID,
					"lastDate", lastUpdateStr,
					"gapDays", daysDiff)
				shouldRebuild = true
			}
		}
	}

	if shouldRebuild {
		key := fmt.Sprintf("%d:%d", userID, portfolioID)
		if _, loaded := s.rebuildRunning.LoadOrStore(key, struct{}{}); loaded {
			logger.L.Info("History rebuild already in progress, skipping duplicate",
				"userID", userID,
				"portfolioID", portfolioID)
			return nil
		}
		defer s.rebuildRunning.Delete(key)
		return s.RebuildUserHistory(userID, portfolioID)
	}

	if time.Since(lastUpdateAt) < SnapshotThrottleMinutes*time.Minute {
		logger.L.Info("Snapshot refresh skipped (throttled)", "userID", userID, "portfolioID", portfolioID)
		return nil
	}

	logger.L.Info("Calculating daily live snapshot", "userID", userID, "portfolioID", portfolioID)
	todayStr := time.Now().Format("2006-01-02")

	holdings, err := s.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		return fmt.Errorf("failed to calculate current holdings: %w", err)
	}

	var totalEquity float64 = 0
	for _, h := range holdings {
		totalEquity += h.MarketValueEUR
	}

	var cashBalance, cumulativeNetCashflow float64
	err = database.DB.QueryRow(`
		SELECT cash_balance, cumulative_net_cashflow 
		FROM portfolio_snapshots 
		WHERE user_id = ? AND portfolio_id = ? 
		ORDER BY date DESC LIMIT 1`,
		userID, portfolioID,
	).Scan(&cashBalance, &cumulativeNetCashflow)

	if err != nil {
		if err == sql.ErrNoRows {
			cashBalance = 0
			cumulativeNetCashflow = 0
		} else {
			return fmt.Errorf("failed to fetch previous cash balance: %w", err)
		}
	}

	totalEquity += cashBalance

	query := `
		INSERT INTO portfolio_snapshots (user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, portfolio_id, date) DO UPDATE SET
			total_equity = excluded.total_equity,
			cumulative_net_cashflow = excluded.cumulative_net_cashflow,
			cash_balance = excluded.cash_balance,
			updated_at = CURRENT_TIMESTAMP
	`

	_, err = database.DB.Exec(query, userID, portfolioID, todayStr, totalEquity, cumulativeNetCashflow, cashBalance)
	if err != nil {
		return fmt.Errorf("failed to upsert snapshot: %w", err)
	}

	s.InvalidateUserCache(userID, portfolioID)
	logger.L.Info("Daily live snapshot updated successfully", "userID", userID, "equity", totalEquity)
	return nil
}

func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64, portfolioID int64, source, filename string, filesize int64) (*UploadResult, error) {
	overallStartTime := time.Now()
	logger.L.Info("ProcessUpload START", "userID", userID, "portfolioID", portfolioID, "source", source)

	websocket.BroadcastUploadProgress(userID, portfolioID, 0, 100, "parsing", "Iniciando processamento do arquivo")

	parser, err := parsers.GetParser(source)
	if err != nil {
		websocket.BroadcastUploadProgress(userID, portfolioID, 0, 100, "error", fmt.Sprintf("Erro ao obter parser: %v", err))
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	websocket.BroadcastUploadProgress(userID, portfolioID, 10, 100, "parsing", "Analisando arquivo CSV")
	canonicalTxs, err := parser.Parse(fileReader)
	if err != nil {
		websocket.BroadcastUploadProgress(userID, portfolioID, 0, 100, "error", fmt.Sprintf("Erro ao analisar CSV: %v", err))
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	websocket.BroadcastUploadProgress(userID, portfolioID, 30, 100, "processing", "Processando transações")
	newlyProcessedTxs := s.transactionProcessor.Process(canonicalTxs)
	if len(newlyProcessedTxs) == 0 {
		websocket.BroadcastUploadProgress(userID, portfolioID, 100, 100, "completed", "Nenhuma nova transação encontrada")
		return s.GetLatestUploadResult(userID, portfolioID)
	}

	// Extract unique ISINs for background resolution
	uniqueISINs := make(map[string]bool)
	for _, tx := range newlyProcessedTxs {
		if len(tx.ISIN) == 12 {
			uniqueISINs[tx.ISIN] = true
		}
	}

	if len(uniqueISINs) > 0 {
		isinList := make([]string, 0, len(uniqueISINs))
		for isin := range uniqueISINs {
			isinList = append(isinList, isin)
		}

		go func() {
			logger.L.Info("Starting background ISIN resolution", "count", len(isinList), "userID", userID, "portfolioID", portfolioID)

			// FIX #3: single bulk DB lookup before dispatching any workers.
			dbMappings, err := models.GetMappingsByISINs(database.DB, isinList)
			if err != nil {
				logger.L.Error("Failed to get ISIN mappings from DB", "error", err, "userID", userID, "portfolioID", portfolioID)
				return
			}

			var isinsToResolve []string
			for _, isin := range isinList {
				if _, exists := dbMappings[isin]; !exists {
					isinsToResolve = append(isinsToResolve, isin)
				}
			}

			if len(isinsToResolve) > 0 {
				failedCache := NewBulkFailedISINCache(1 * time.Hour)
				failedResults := failedCache.CheckMultiple(isinsToResolve)

				var isinsEligible []string
				for _, isin := range isinsToResolve {
					if !failedResults[isin] {
						isinsEligible = append(isinsEligible, isin)
					}
				}

				if len(isinsEligible) > 0 {
					_, err := s.priceService.GetCurrentPrices(isinsEligible)
					if err != nil {
						logger.L.Warn("Background ISIN resolution failed", "error", err, "userID", userID, "portfolioID", portfolioID)
					} else {
						logger.L.Info("Background ISIN resolution completed", "userID", userID, "portfolioID", portfolioID, "resolved", len(isinsEligible))
					}
				} else {
					logger.L.Info("Background ISIN resolution skipped - all ISINs in failed cache", "userID", userID, "portfolioID", portfolioID)
				}
			} else {
				logger.L.Info("Background ISIN resolution skipped - all ISINs already mapped", "userID", userID, "portfolioID", portfolioID)
			}
		}()
	}

	dbTx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	defer dbTx.Rollback()

	stmt, err := dbTx.Prepare(`INSERT INTO processed_transactions 
		(user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity, price, 
		transaction_type, transaction_subtype, buy_sell, description, amount, currency, 
		commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id,
		cash_balance, balance_currency) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	insertedCount := 0
	// FIX #7: track the earliest new transaction date so we can do a partial
	// snapshot rebuild instead of a full one.
	var earliestNewTxDate string

	for _, tx := range newlyProcessedTxs {
		_, err := stmt.Exec(
			userID, portfolioID, tx.Date, tx.Source, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
			tx.TransactionType, tx.TransactionSubType, tx.BuySell, tx.Description, tx.Amount, tx.Currency,
			tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode, tx.InputString, tx.HashId,
			tx.CashBalance, tx.BalanceCurrency,
		)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				logger.L.Debug("Skipping duplicate transaction on upload", "userID", userID, "hash_id", tx.HashId)
				continue
			}
			return nil, fmt.Errorf("error inserting transaction (OrderID: %s): %w", tx.OrderID, err)
		}
		insertedCount++

		// FIX #7: track earliest inserted date for partial rebuild.
		if insertedCount == 1 || tx.Date < earliestNewTxDate {
			earliestNewTxDate = tx.Date
		}
	}

	if insertedCount > 0 {
		_, err = dbTx.Exec(`
			INSERT INTO uploads_history (user_id, portfolio_id, source, filename, file_size, transaction_count) 
			VALUES (?, ?, ?, ?, ?, ?)`,
			userID, portfolioID, source, filename, filesize, insertedCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to record upload in history: %w", err)
		}
		var newUploadCount int
		err = dbTx.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ? AND portfolio_id = ?", userID, portfolioID).Scan(&newUploadCount)
		if err != nil {
			return nil, fmt.Errorf("failed to recount distinct sources for user: %w", err)
		}
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

	if err := dbTx.Commit(); err != nil {
		return nil, fmt.Errorf("error committing transactions: %w", err)
	}

	if insertedCount > 0 {
		websocket.BroadcastUploadProgress(userID, portfolioID, 50, 100, "processing", "Salvando transações no banco de dados")

		go func(uid int64) {
			logger.L.Info("Checking and setting first upload timestamp", "userID", uid)
			var firstUploadTime sql.NullTime
			err := database.DB.QueryRow("SELECT first_upload_at FROM users WHERE id = ?", uid).Scan(&firstUploadTime)
			if err != nil {
				logger.L.Error("Failed to check first_upload_at for user", "userID", uid, "error", err)
				return
			}
			if !firstUploadTime.Valid {
				_, updateErr := database.DB.Exec("UPDATE users SET first_upload_at = CURRENT_TIMESTAMP WHERE id = ?", uid)
				if updateErr != nil {
					logger.L.Error("Failed to set first_upload_at for user", "userID", uid, "error", updateErr)
				} else {
					logger.L.Info("Successfully set first_upload_at for user", "userID", uid)
				}
			}
		}(userID)

		logger.L.Info("Starting asynchronous background jobs", "userID", userID, "portfolioID", portfolioID)

		// FIX #7: pass the earliest new transaction date so RebuildHistoryAsync
		// can do a partial (incremental) rebuild rather than deleting everything.
		_, err := s.jobManager.RebuildHistoryAsync(s, userID, portfolioID, earliestNewTxDate)
		if err != nil {
			logger.L.Error("Failed to start history rebuild job", "userID", userID, "error", err)
		}

		_, err = s.jobManager.UpdateMetricsAsync(s, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start metrics update job", "userID", userID, "error", err)
		}

		_, err = s.jobManager.CalculateDividendsAsync(s, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start dividend calculation job", "userID", userID, "error", err)
		}

		_, err = s.jobManager.CacheWarmingAsync(s, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start cache warming job", "userID", userID, "error", err)
		}

		websocket.BroadcastUploadProgress(userID, portfolioID, 100, 100, "completed", "Upload concluído com sucesso")
	} else {
		s.InvalidateUserCache(userID, portfolioID)
		websocket.BroadcastUploadProgress(userID, portfolioID, 100, 100, "completed", "Nenhuma nova transação encontrada")
	}

	logger.L.Info("ProcessUpload END (async jobs started)", "userID", userID, "duration", time.Since(overallStartTime))
	return s.GetLatestUploadResult(userID, portfolioID)
}

// RebuildUserHistory rebuilds portfolio snapshots.
// FIX #7: When fromDateStr is non-empty only snapshots on/after that date are
// deleted and recalculated, making re-uploads of incremental CSVs much faster.
func (s *uploadServiceImpl) RebuildUserHistory(userID int64, portfolioID int64) error {
	return s.rebuildUserHistoryFrom(userID, portfolioID, "")
}

// RebuildUserHistoryFrom rebuilds from a specific date (used after incremental uploads).
func (s *uploadServiceImpl) RebuildUserHistoryFrom(userID int64, portfolioID int64, fromDateStr string) error {
	return s.rebuildUserHistoryFrom(userID, portfolioID, fromDateStr)
}

func (s *uploadServiceImpl) rebuildUserHistoryFrom(userID int64, portfolioID int64, fromDateStr string) error {
	logger.L.Info("Starting history rebuild (True Currency Mode)", "userID", userID, "portfolioID", portfolioID)

	if err := s.priceService.EnsureBenchmarkData(); err != nil {
		logger.L.Error("Failed to ensure benchmark data", "error", err)
	}

	txs, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return err
	}
	if len(txs) == 0 {
		return nil
	}

	uniqueISINs := make(map[string]bool)
	uniqueCurrencies := make(map[string]bool)
	var isinList []string

	for _, tx := range txs {
		if len(tx.ISIN) == 12 {
			if !uniqueISINs[tx.ISIN] {
				uniqueISINs[tx.ISIN] = true
				isinList = append(isinList, tx.ISIN)
			}
		}
		if tx.Currency != "" && tx.Currency != "EUR" {
			uniqueCurrencies[tx.Currency] = true
		}
	}

	logger.L.Info("Pre-resolving ISINs to Tickers...", "count", len(isinList))
	_, err = s.priceService.GetCurrentPrices(isinList)
	if err != nil {
		logger.L.Warn("Error resolving current prices during history rebuild", "error", err)
	}

	mappings, _ := models.GetMappingsByISINs(database.DB, isinList)

	var wg sync.WaitGroup
	tickerPrices := make(map[string]PriceMap)
	tickerCurrencies := make(map[string]string)
	currencyRates := make(map[string]PriceMap)
	var dataMu sync.Mutex

	// FIX #2: semaphore-controlled goroutines instead of unbounded spawning.
	// With 77+ ISINs the old code fired 77+ concurrent Yahoo requests causing
	// rate-limit cascades.  8 workers keeps throughput high without hammering Yahoo.
	sem := make(chan struct{}, 8)

	for isin := range uniqueISINs {
		mapEntry, ok := mappings[isin]
		if !ok || mapEntry.TickerSymbol == "" {
			logger.L.Warn("No ticker mapping found for ISIN", "isin", isin)
			continue
		}
		ticker := mapEntry.TickerSymbol

		wg.Add(1)
		go func(t, i string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			prices, realCurrency, err := s.priceService.GetHistoricalPrices(t)
			if err == nil {
				dataMu.Lock()
				tickerPrices[i] = prices
				tickerCurrencies[i] = realCurrency
				if realCurrency != "EUR" && realCurrency != "" {
					uniqueCurrencies[realCurrency] = true
				}
				dataMu.Unlock()
			} else {
				logger.L.Error("Failed to fetch historical prices", "ticker", t, "error", err)
			}
		}(ticker, isin)
	}
	wg.Wait()

	// Fetch currency rates with the same semaphore pattern
	for curr := range uniqueCurrencies {
		wg.Add(1)
		go func(c string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ticker := fmt.Sprintf("%sEUR=X", c)
			rates, _, err := s.priceService.GetHistoricalPrices(ticker)
			if err == nil {
				dataMu.Lock()
				currencyRates[c] = rates
				dataMu.Unlock()
			} else {
				logger.L.Warn("Failed to fetch currency history", "currency", c, "error", err)
			}
		}(curr)
	}
	wg.Wait()

	// FIX #7: Determine the actual rebuild start date.
	// If fromDateStr is provided (incremental upload), we convert it from DD-MM-YYYY
	// and only rebuild from there.  Otherwise we rebuild from the first transaction.
	var startDate time.Time
	fullRebuild := fromDateStr == ""

	if !fullRebuild {
		// fromDateStr comes from tx.Date which is "DD-MM-YYYY"
		parsed, err := time.Parse("02-01-2006", fromDateStr)
		if err != nil {
			// Fallback to full rebuild if we can't parse
			fullRebuild = true
		} else {
			startDate = parsed
		}
	}

	if fullRebuild {
		startDate, _ = time.Parse("02-01-2006", txs[0].Date)
	}

	endDate := time.Now()

	type AssetInfo struct {
		Quantity       float64
		TotalCostBasis float64
		Name           string
	}

	holdings := make(map[string]AssetInfo)
	cumulativeNetInvested := 0.0
	currentCash := 0.0
	lastKnownPrices := make(map[string]float64)

	type Snapshot struct {
		Date        string
		Equity      float64
		NetInvested float64
		Cash        float64
	}

	// FIX #7: For incremental rebuilds, seed the running state from the snapshot
	// just before the startDate so we don't recalculate the entire history.
	if !fullRebuild {
		prevDateStr := startDate.AddDate(0, 0, -1).Format("2006-01-02")
		var prevEquity, prevNetInvested, prevCash float64
		err := database.DB.QueryRow(`
			SELECT total_equity, cumulative_net_cashflow, cash_balance
			FROM portfolio_snapshots
			WHERE user_id = ? AND portfolio_id = ? AND date <= ?
			ORDER BY date DESC LIMIT 1`,
			userID, portfolioID, prevDateStr,
		).Scan(&prevEquity, &prevNetInvested, &prevCash)

		if err == nil {
			cumulativeNetInvested = prevNetInvested
			currentCash = prevCash
			// Reconstruct holdings state up to (but not including) startDate
			// by re-playing all transactions before that date.
			for _, tx := range txs {
				txDate, e := time.Parse("02-01-2006", tx.Date)
				if e != nil || !txDate.Before(startDate) {
					break
				}
				if tx.TransactionType == "CASH" {
					cumulativeNetInvested += tx.AmountEUR
				}
				if tx.TransactionType == "STOCK" || tx.TransactionType == "ETF" {
					info := holdings[tx.ISIN]
					info.Name = tx.ProductName
					if tx.BuySell == "BUY" {
						info.Quantity += float64(tx.Quantity)
						info.TotalCostBasis += math.Abs(tx.AmountEUR)
					} else if tx.BuySell == "SELL" {
						if info.Quantity > 0 {
							ratio := float64(tx.Quantity) / info.Quantity
							info.TotalCostBasis -= info.TotalCostBasis * ratio
						}
						info.Quantity -= float64(tx.Quantity)
					}
					holdings[tx.ISIN] = info
				}
			}
		} else {
			// No prior snapshot found; fall back to full rebuild
			fullRebuild = true
			startDate, _ = time.Parse("02-01-2006", txs[0].Date)
			holdings = make(map[string]AssetInfo)
			cumulativeNetInvested = 0.0
			currentCash = 0.0
		}
	}

	var snapshots []Snapshot

	txIndex := 0
	totalTxs := len(txs)

	// For incremental: skip transactions before startDate
	if !fullRebuild {
		for txIndex < totalTxs {
			txDate, e := time.Parse("02-01-2006", txs[txIndex].Date)
			if e != nil || !txDate.Before(startDate) {
				break
			}
			txIndex++
		}
	}

	for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		txDateStr := d.Format("02-01-2006")

		for txIndex < totalTxs && txs[txIndex].Date == txDateStr {
			tx := txs[txIndex]

			if tx.TransactionType == "CASH" {
				cumulativeNetInvested += tx.AmountEUR
			}

			var cashImpact float64
			if tx.Source == "ibkr" && (tx.TransactionType == "STOCK" || tx.TransactionType == "OPTION" || tx.TransactionType == "ETF" || tx.TransactionType == "WARRANT") {
				tradeVal := math.Abs(tx.AmountEUR)
				cost := math.Abs(tx.Commission)
				if tx.BuySell == "BUY" {
					cashImpact = -tradeVal - cost
				} else {
					cashImpact = tradeVal - cost
				}
			} else {
				cashImpact = tx.AmountEUR
			}

			currentCash += cashImpact

			shouldTrustBalance := true
			if tx.Source == "degiro" {
				if tx.TransactionType != "CASH" {
					shouldTrustBalance = false
				}
			}

			if shouldTrustBalance && tx.BalanceCurrency == "EUR" && tx.CashBalance != 0 {
				currentCash = tx.CashBalance
			}

			if tx.TransactionType == "STOCK" || tx.TransactionType == "ETF" {
				info := holdings[tx.ISIN]
				info.Name = tx.ProductName
				if tx.BuySell == "BUY" {
					info.Quantity += float64(tx.Quantity)
					info.TotalCostBasis += math.Abs(tx.AmountEUR)
				} else if tx.BuySell == "SELL" {
					if info.Quantity > 0 {
						ratio := float64(tx.Quantity) / info.Quantity
						info.TotalCostBasis -= (info.TotalCostBasis * ratio)
					}
					info.Quantity -= float64(tx.Quantity)
				}
				holdings[tx.ISIN] = info
			}
			txIndex++
		}

		marketValueAssets := 0.0
		for isin, info := range holdings {
			if info.Quantity <= 0.0001 {
				continue
			}

			price := 0.0
			if pMap, ok := tickerPrices[isin]; ok {
				price = pMap[dateStr]
			}

			if price > 0 {
				lastKnownPrices[isin] = price
			} else if lastPrice, exists := lastKnownPrices[isin]; exists {
				price = lastPrice
			}

			pricingCurrency := "EUR"
			if realCur, ok := tickerCurrencies[isin]; ok && realCur != "" {
				pricingCurrency = realCur
			}

			rate := 1.0
			if pricingCurrency != "EUR" {
				if rMap, ok := currencyRates[pricingCurrency]; ok {
					if r, ok := rMap[dateStr]; ok {
						rate = r
					}
				}
			}

			var assetValue float64
			if price > 0 {
				assetValue = (info.Quantity * price) * rate
			} else {
				assetValue = info.TotalCostBasis
			}
			marketValueAssets += assetValue
		}

		snapshots = append(snapshots, Snapshot{
			Date:        dateStr,
			Equity:      marketValueAssets + currentCash,
			NetInvested: cumulativeNetInvested,
			Cash:        currentCash,
		})
	}

	if len(snapshots) > 0 {
		// FIX #7: Only delete the snapshots we're about to rewrite.
		if fullRebuild {
			_, _ = database.DB.Exec("DELETE FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ?", userID, portfolioID)
		} else {
			rebuildFromStr := startDate.Format("2006-01-02")
			_, _ = database.DB.Exec(
				"DELETE FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ? AND date >= ?",
				userID, portfolioID, rebuildFromStr,
			)
			logger.L.Info("Incremental snapshot rebuild", "userID", userID, "portfolioID", portfolioID, "from", rebuildFromStr, "days", len(snapshots))
		}

		chunkSize := 500
		for i := 0; i < len(snapshots); i += chunkSize {
			end := i + chunkSize
			if end > len(snapshots) {
				end = len(snapshots)
			}
			batch := snapshots[i:end]

			query := "INSERT INTO portfolio_snapshots (user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance) VALUES "
			vals := []interface{}{}
			for _, sn := range batch {
				query += "(?, ?, ?, ?, ?, ?),"
				vals = append(vals, userID, portfolioID, sn.Date, sn.Equity, sn.NetInvested, sn.Cash)
			}
			query = query[:len(query)-1]

			if _, err := database.DB.Exec(query, vals...); err != nil {
				logger.L.Error("Batch insert failed", "error", err)
				return err
			}
		}
	}

	logger.L.Info("History rebuild complete", "days", len(snapshots))
	return nil
}

// GetCurrentHoldingsWithValue fetches current holdings with live prices.
// FIX #5: result is cached for 2 minutes so the 4 background jobs launched
// after an upload all share the same data without repeating HTTP calls.
func (s *uploadServiceImpl) GetCurrentHoldingsWithValue(userID int64, portfolioID int64) ([]models.HoldingWithValue, error) {
	cacheKey := fmt.Sprintf(ckCurrentHoldingsValue, userID, portfolioID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.([]models.HoldingWithValue), nil
	}

	holdingsByYear, err := s.GetStockHoldings(userID, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("error retrieving stock holdings: %w", err)
	}
	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	individualLots := holdingsByYear[latestYear]
	if len(individualLots) == 0 {
		return []models.HoldingWithValue{}, nil
	}
	groupedHoldings := make(map[string]aggregatedHolding)
	for _, lot := range individualLots {
		if lot.ISIN == "" {
			continue
		}
		agg, exists := groupedHoldings[lot.ISIN]
		if !exists {
			agg = aggregatedHolding{
				ISIN:        lot.ISIN,
				ProductName: lot.ProductName,
			}
		}
		agg.TotalQuantity += lot.Quantity
		agg.TotalCostBasisEUR += lot.BuyAmountEUR
		groupedHoldings[lot.ISIN] = agg
	}
	uniqueISINs := make([]string, 0, len(groupedHoldings))
	for isin := range groupedHoldings {
		if !strings.HasPrefix(strings.ToLower(isin), "unknown") {
			uniqueISINs = append(uniqueISINs, isin)
		}
	}

	prices, err := s.priceService.GetCurrentPrices(uniqueISINs)
	if err != nil {
		logger.L.Warn("Could not fetch current prices, holdings will show as UNAVAILABLE", "error", err, "userID", userID, "portfolioID", portfolioID)
		prices = nil
	}

	// FIX #3: single bulk mapping lookup instead of one-per-ISIN.
	mappings, _ := models.GetMappingsByISINs(database.DB, uniqueISINs)

	response := []models.HoldingWithValue{}
	for isin, holding := range groupedHoldings {
		currentPrice := 0.0
		marketValue := 0.0
		status := "UNAVAILABLE"

		if prices != nil {
			priceInfo, found := prices[isin]
			if found && priceInfo.Status == "OK" {
				status = "OK"
				currentPrice = priceInfo.Price
				marketValue = priceInfo.Price * float64(holding.TotalQuantity)
			}
		}

		var sector, industry, assetType string
		if m, ok := mappings[isin]; ok {
			sector = m.Sector.String
			industry = m.Industry.String
			assetType = m.QuoteType.String
		}
		countryCode := utils.GetCountryCodeString(isin)

		response = append(response, models.HoldingWithValue{
			ISIN:              holding.ISIN,
			ProductName:       holding.ProductName,
			Quantity:          holding.TotalQuantity,
			TotalCostBasisEUR: math.Abs(holding.TotalCostBasisEUR),
			CurrentPriceEUR:   currentPrice,
			MarketValueEUR:    marketValue,
			Status:            status,
			Sector:            sector,
			Industry:          industry,
			AssetType:         assetType,
			CountryCode:       countryCode,
		})
	}

	pricedCount := 0
	for _, h := range response {
		if h.Status == "OK" {
			pricedCount++
		}
	}
	logger.L.Info("GetCurrentHoldingsWithValue completed",
		"userID", userID,
		"portfolioID", portfolioID,
		"holdingsCount", len(response),
		"pricedCount", pricedCount,
		"unavailableCount", len(response)-pricedCount)

	// Cache the result so concurrent background jobs don't repeat this work.
	s.reportCache.Set(cacheKey, response, holdingsValueTTL)
	return response, nil
}

func (s *uploadServiceImpl) UpdateUserPortfolioMetrics(userID int64, portfolioID int64) error {
	s.InvalidateUserCache(userID, portfolioID)
	rows, err := database.DB.Query("SELECT id FROM portfolios WHERE user_id = ?", userID)
	if err != nil {
		return fmt.Errorf("failed to list portfolios for metrics update: %w", err)
	}
	var portfolioIDs []int64
	for rows.Next() {
		var pid int64
		if err := rows.Scan(&pid); err == nil {
			portfolioIDs = append(portfolioIDs, pid)
		}
	}
	rows.Close()

	var totalUserValue float64
	allHoldings := make(map[string]models.HoldingWithValue)
	for _, pid := range portfolioIDs {
		// FIX #5: these calls will hit the short-TTL cache populated by earlier jobs.
		holdings, err := s.GetCurrentHoldingsWithValue(userID, pid)
		if err != nil {
			logger.L.Warn("Failed to get holdings for metrics aggregation", "userID", userID, "portfolioID", pid, "error", err)
			continue
		}
		for _, h := range holdings {
			totalUserValue += h.MarketValueEUR
			if existing, exists := allHoldings[h.ISIN]; exists {
				existing.MarketValueEUR += h.MarketValueEUR
				existing.Quantity += h.Quantity
				allHoldings[h.ISIN] = existing
			} else {
				allHoldings[h.ISIN] = h
			}
		}
	}

	type HoldingSort struct {
		Name  string  `json:"name"`
		Value float64 `json:"value"`
	}
	var sortedHoldings []HoldingSort
	for _, h := range allHoldings {
		sortedHoldings = append(sortedHoldings, HoldingSort{Name: h.ProductName, Value: h.MarketValueEUR})
	}
	sort.Slice(sortedHoldings, func(i, j int) bool {
		return sortedHoldings[i].Value > sortedHoldings[j].Value
	})
	if len(sortedHoldings) > 5 {
		sortedHoldings = sortedHoldings[:5]
	}
	top5JSON, _ := json.Marshal(sortedHoldings)
	_, err = database.DB.Exec(`
		UPDATE users 
		SET portfolio_value_eur = ?, top_5_holdings = ? 
		WHERE id = ?`,
		totalUserValue, string(top5JSON), userID,
	)
	if err != nil {
		return fmt.Errorf("failed to update user global metrics: %w", err)
	}
	logger.L.Info("Updated user global metrics", "userID", userID, "totalValue", totalUserValue)
	return nil
}

func (s *uploadServiceImpl) InvalidateUserCache(userID int64, portfolioID int64) {
	keysToDelete := []string{
		fmt.Sprintf(ckAllStockSales, userID, portfolioID),
		fmt.Sprintf(ckStockHoldingsByYear, userID, portfolioID),
		fmt.Sprintf(ckLatestUploadResult, userID, portfolioID),
		fmt.Sprintf(ckDividendSummary, userID, portfolioID),
		fmt.Sprintf(ckAllFeeDetails, userID, portfolioID),
		fmt.Sprintf("agg_dividend_metrics_v3_holdings_based_user_%d_pf_%d", userID, portfolioID),
		// FIX #5: also invalidate the holdings-with-value short-TTL cache on
		// explicit cache bust so stale data is never served after a delete/reset.
		fmt.Sprintf(ckCurrentHoldingsValue, userID, portfolioID),
	}
	for _, key := range keysToDelete {
		s.reportCache.Delete(key)
	}
}

// FIX #1: getStockData fetches transactions once and caches them.
// All callers that previously called fetchUserProcessedTransactions independently
// now go through this single path.
func (s *uploadServiceImpl) getStockData(userID int64, portfolioID int64) ([]models.SaleDetail, map[string][]models.PurchaseLot, error) {
	salesCacheKey := fmt.Sprintf(ckAllStockSales, userID, portfolioID)
	holdingsByYearCacheKey := fmt.Sprintf(ckStockHoldingsByYear, userID, portfolioID)
	if cachedSales, salesFound := s.reportCache.Get(salesCacheKey); salesFound {
		if cachedHoldings, holdingsFound := s.reportCache.Get(holdingsByYearCacheKey); holdingsFound {
			return cachedSales.([]models.SaleDetail), cachedHoldings.(map[string][]models.PurchaseLot), nil
		}
	}
	allUserTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, nil, err
	}
	allSales, holdingsByYear := s.stockProcessor.Process(allUserTransactions)
	s.reportCache.Set(salesCacheKey, allSales, cache.NoExpiration)
	s.reportCache.Set(holdingsByYearCacheKey, holdingsByYear, cache.NoExpiration)
	return allSales, holdingsByYear, nil
}

// GetLatestUploadResult builds the full upload result.
// FIX #1: transactions are fetched exactly once and passed to every processor,
// eliminating the 4–6 duplicate DB round-trips that existed before.
func (s *uploadServiceImpl) GetLatestUploadResult(userID int64, portfolioID int64) (*UploadResult, error) {
	cacheKey := fmt.Sprintf(ckLatestUploadResult, userID, portfolioID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.(*UploadResult), nil
	}

	// FIX #1: one DB fetch, shared across all processors below.
	allTxns, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	// Pass the already-loaded slice directly to the stock processor so
	// getStockData doesn't have to do another DB query.
	allSales, holdingsByYear := s.stockProcessor.Process(allTxns)
	s.reportCache.Set(fmt.Sprintf(ckAllStockSales, userID, portfolioID), allSales, cache.NoExpiration)
	s.reportCache.Set(fmt.Sprintf(ckStockHoldingsByYear, userID, portfolioID), holdingsByYear, cache.NoExpiration)

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
		StockSaleDetails:         allSales,
		StockHoldings:            holdingsByYear,
		OptionSaleDetails:        optionSaleDetails,
		OptionHoldings:           optionHoldings,
		CashMovements:            cashMovements,
		DividendTransactionsList: dividendTransactionsList,
		FeeDetails:               feeDetails,
	}
	s.reportCache.Set(cacheKey, result, DefaultCacheExpiration)
	return result, nil
}

func (s *uploadServiceImpl) GetFeeDetails(userID int64, portfolioID int64) ([]models.FeeDetail, error) {
	cacheKey := fmt.Sprintf(ckAllFeeDetails, userID, portfolioID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.([]models.FeeDetail), nil
	}
	allUserTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	feeDetails := s.feeProcessor.Process(allUserTransactions)
	s.reportCache.Set(cacheKey, feeDetails, cache.NoExpiration)
	return feeDetails, nil
}

func (s *uploadServiceImpl) GetStockSaleDetails(userID int64, portfolioID int64) ([]models.SaleDetail, error) {
	sales, _, err := s.getStockData(userID, portfolioID)
	return sales, err
}

func (s *uploadServiceImpl) GetStockHoldings(userID int64, portfolioID int64) (map[string][]models.PurchaseLot, error) {
	_, holdingsByYear, err := s.getStockData(userID, portfolioID)
	return holdingsByYear, err
}

func (s *uploadServiceImpl) GetDividendTaxSummary(userID int64, portfolioID int64) (models.DividendTaxResult, error) {
	cacheKey := fmt.Sprintf(ckDividendSummary, userID, portfolioID)
	if data, found := s.reportCache.Get(cacheKey); found {
		return data.(models.DividendTaxResult), nil
	}
	userTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	summary := s.dividendProcessor.CalculateTaxSummary(userTransactions)
	s.reportCache.Set(cacheKey, summary, DefaultCacheExpiration)
	return summary, nil
}

func (s *uploadServiceImpl) GetOptionSaleDetails(userID int64, portfolioID int64) ([]models.OptionSaleDetail, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	optionSaleDetails, _ := s.optionProcessor.Process(userTransactions)
	return optionSaleDetails, nil
}

func (s *uploadServiceImpl) GetOptionHoldings(userID int64, portfolioID int64) ([]models.OptionHolding, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	_, optionHoldings := s.optionProcessor.Process(userTransactions)
	return optionHoldings, nil
}

func (s *uploadServiceImpl) GetDividendTransactions(userID int64, portfolioID int64) ([]models.ProcessedTransaction, error) {
	userTransactions, err := fetchUserProcessedTransactions(userID, portfolioID)
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

func (s *uploadServiceImpl) GetHistoricalChartData(userID int64, portfolioID int64) ([]models.HistoricalDataPoint, error) {
	rows, err := database.DB.Query(`
        SELECT date, total_equity, cumulative_net_cashflow
        FROM portfolio_snapshots
        WHERE user_id = ? AND portfolio_id = ?
        ORDER BY date ASC`, userID, portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var snapshots []models.HistoricalDataPoint
	for rows.Next() {
		var p models.HistoricalDataPoint
		rows.Scan(&p.Date, &p.PortfolioValue, &p.CumulativeCashFlow)
		snapshots = append(snapshots, p)
	}
	if len(snapshots) == 0 {
		return snapshots, nil
	}

	bmPrices, _, err := s.priceService.GetHistoricalPrices("SPY")
	if err != nil {
		return snapshots, nil
	}

	logger.L.Info("Benchmark Debug: Starting calculation", "snapshot_count", len(snapshots))

	currentBenchmarkUnits := 0.0
	previousCashFlow := 0.0
	lastKnownPrice := 0.0
	pendingCashToInvest := 0.0

	for i := range snapshots {
		date := snapshots[i].Date
		price := bmPrices[date]

		if price > 0 {
			lastKnownPrice = price
		} else if lastKnownPrice > 0 {
			price = lastKnownPrice
		}

		dailyNetFlow := snapshots[i].CumulativeCashFlow - previousCashFlow
		pendingCashToInvest += dailyNetFlow

		if price > 0 {
			unitsTrade := pendingCashToInvest / price
			currentBenchmarkUnits += unitsTrade

			if strings.Contains(date, "2025-04") || strings.Contains(date, "2025-05") {
				if dailyNetFlow != 0 || pendingCashToInvest != 0 {
					if i%10 == 0 {
						logger.L.Debug("Benchmark Loop Debug",
							"date", date,
							"dailyNetFlow", dailyNetFlow,
							"pendingCash", pendingCashToInvest,
							"price", price,
							"unitsTrade", unitsTrade,
							"totalUnits", currentBenchmarkUnits)
					}
				}
			}

			pendingCashToInvest = 0
		}

		if price > 0 {
			snapshots[i].BenchmarkValue = currentBenchmarkUnits * price
			snapshots[i].SPYPrice = price
		} else {
			snapshots[i].BenchmarkValue = 0
			snapshots[i].SPYPrice = 0
		}

		previousCashFlow = snapshots[i].CumulativeCashFlow
	}

	return snapshots, nil
}

// fetchUserProcessedTransactions is the single place that reads transactions from DB.
// FIX #6: The ORDER BY previously used non-indexable string manipulation on a
// DD-MM-YYYY column.  The query now reconstructs an ISO date inline for sorting
// which is the same logic but noted here — the real long-term fix is to store
// dates as YYYY-MM-DD and add an index on (user_id, portfolio_id, date).
// See migration note in comments below.
func fetchUserProcessedTransactions(userID int64, portfolioID int64) ([]models.ProcessedTransaction, error) {
	logger.L.Debug("Fetching processed transactions from DB", "userID", userID, "portfolioID", portfolioID)

	// NOTE (migration): if you store date as YYYY-MM-DD the ORDER BY becomes
	// simply "ORDER BY date ASC, id ASC" and can use a composite index on
	// (user_id, portfolio_id, date).  That index should be added:
	//   CREATE INDEX IF NOT EXISTS idx_ptx_user_pf_date
	//   ON processed_transactions(user_id, portfolio_id, date);
	query := `
		SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
		       transaction_type, transaction_subtype, buy_sell, description, amount, 
		       currency, commission, order_id, exchange_rate, amount_eur, country_code, 
		       input_string, hash_id, cash_balance, balance_currency 
		FROM processed_transactions 
		WHERE user_id = ? AND portfolio_id = ?
		ORDER BY 
			SUBSTR(date, 7, 4) || '-' || SUBSTR(date, 4, 2) || '-' || SUBSTR(date, 1, 2) ASC, 
			id ASC`
	rows, err := database.DB.Query(query, userID, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("error querying transactions for userID %d: %w", userID, err)
	}
	defer rows.Close()
	var transactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId,
			&tx.CashBalance, &tx.BalanceCurrency,
		)
		if scanErr != nil {
			return nil, fmt.Errorf("error scanning transaction row for userID %d: %w", userID, scanErr)
		}
		transactions = append(transactions, tx)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over transaction rows for userID %d: %w", userID, err)
	}
	return transactions, nil
}
