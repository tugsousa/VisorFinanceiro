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
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
)

const (
	ckAllStockSales       = "res_all_stock_sales_user_%d"
	ckStockHoldingsByYear = "res_stock_holdings_by_year_user_%d"
	ckAllFeeDetails       = "res_all_fee_details_user_%d"
	ckLatestUploadResult  = "agg_latest_upload_result_user_%d"
	ckDividendSummary     = "agg_dividend_summary_user_%d"

	DefaultCacheExpiration = 15 * time.Minute
	CacheCleanupInterval   = 30 * time.Minute
)

// Helper struct for aggregating purchase lots by ISIN, internal to the service.
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
	}
}

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

	dbTx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	defer dbTx.Rollback()

	// Insert Statement includes cash_balance and balance_currency
	stmt, err := dbTx.Prepare(`INSERT INTO processed_transactions 
		(user_id, date, source, product_name, isin, quantity, original_quantity, price, 
		transaction_type, transaction_subtype, buy_sell, description, amount, currency, 
		commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id,
		cash_balance, balance_currency) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	insertedCount := 0
	for _, tx := range newlyProcessedTxs {
		_, err := stmt.Exec(
			userID, tx.Date, tx.Source, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
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
	}

	if insertedCount > 0 {
		_, err = dbTx.Exec(`
			INSERT INTO uploads_history (user_id, source, filename, file_size, transaction_count) 
			VALUES (?, ?, ?, ?, ?)`,
			userID, source, filename, filesize, insertedCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to record upload in history: %w", err)
		}

		var newUploadCount int
		err = dbTx.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ?", userID).Scan(&newUploadCount)
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

		go func() {
			// 1. Update Metrics
			logger.L.Info("Triggering portfolio metrics update (pre-requisite for history)", "userID", userID)
			if err := s.UpdateUserPortfolioMetrics(userID); err != nil {
				logger.L.Error("Failed to update user portfolio metrics", "userID", userID, "error", err)
			}

			// 2. Rebuild History
			logger.L.Info("Triggering history rebuild", "userID", userID)
			if err := s.RebuildUserHistory(userID); err != nil {
				logger.L.Error("Failed to rebuild user history", "userID", userID, "error", err)
			}
		}()
	} else {
		s.InvalidateUserCache(userID)
	}

	logger.L.Info("ProcessUpload END", "userID", userID, "duration", time.Since(overallStartTime))
	return s.GetLatestUploadResult(userID)
}

// RebuildUserHistory implements the calculation engine for daily portfolio snapshots.
func (s *uploadServiceImpl) RebuildUserHistory(userID int64) error {
	logger.L.Info("Starting history rebuild (Currency Correction Mode)", "userID", userID)

	// Ensure benchmark data
	if err := s.priceService.EnsureBenchmarkData(); err != nil {
		logger.L.Error("Failed to ensure benchmark data", "error", err)
	}

	// A. Fetch all transactions
	txs, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return err
	}
	if len(txs) == 0 {
		return nil
	}

	// B. Identify unique Assets (ISINs) and Currencies
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
		// We still track transaction currencies to ensure we have rates for Cash balances
		if tx.Currency != "" && tx.Currency != "EUR" {
			uniqueCurrencies[tx.Currency] = true
		}
	}

	// C. Resolve ISINs to Tickers & Currencies
	mappings, _ := model.GetMappingsByISINs(database.DB, isinList)

	// Add Ticker Currencies to the list of currencies to fetch rates for
	for _, mapping := range mappings {
		if mapping.Currency != "" && mapping.Currency != "EUR" {
			uniqueCurrencies[mapping.Currency] = true
		}
	}

	// D. Fetch Historical Data
	var wg sync.WaitGroup
	tickerPrices := make(map[string]PriceMap)
	currencyRates := make(map[string]PriceMap)
	var dataMu sync.Mutex

	// Fetch Stock Prices
	for isin := range uniqueISINs {
		mapEntry, ok := mappings[isin]
		if !ok || mapEntry.TickerSymbol == "" {
			continue
		}
		ticker := mapEntry.TickerSymbol
		wg.Add(1)
		go func(t, i string) {
			defer wg.Done()
			prices, err := s.priceService.GetHistoricalPrices(t)
			if err == nil {
				dataMu.Lock()
				tickerPrices[i] = prices
				dataMu.Unlock()
			}
		}(ticker, isin)
	}

	// Fetch Exchange Rates
	for curr := range uniqueCurrencies {
		wg.Add(1)
		go func(c string) {
			defer wg.Done()
			ticker := fmt.Sprintf("%sEUR=X", c)
			rates, err := s.priceService.GetHistoricalPrices(ticker)
			if err == nil {
				dataMu.Lock()
				currencyRates[c] = rates
				dataMu.Unlock()
			}
		}(curr)
	}

	wg.Wait()

	// E. The Daily Loop
	startDate, _ := time.Parse("02-01-2006", txs[0].Date)
	endDate := time.Now()

	type AssetInfo struct {
		Quantity       float64
		Currency       string // This is the Transaction Currency (e.g. EUR)
		TotalCostBasis float64
		Name           string
	}
	holdings := make(map[string]AssetInfo)
	cumulativeNetInvested := 0.0
	currentCash := 0.0

	// Memories for Fill-Forward
	lastKnownPrices := make(map[string]float64)
	lastKnownRates := make(map[string]float64)

	type Snapshot struct {
		Date        string
		Equity      float64
		NetInvested float64
		Cash        float64
	}
	var snapshots []Snapshot

	txIndex := 0
	totalTxs := len(txs)

	for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		txDateStr := d.Format("02-01-2006")

		// --- 1. Process Transactions ---
		for txIndex < totalTxs && txs[txIndex].Date == txDateStr {
			tx := txs[txIndex]
			if tx.TransactionType == "CASH" {
				cumulativeNetInvested += tx.AmountEUR
			}
			if tx.TransactionType == "STOCK" || tx.TransactionType == "ETF" {
				info := holdings[tx.ISIN]
				info.Currency = tx.Currency
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
			if tx.BalanceCurrency == "EUR" {
				currentCash = tx.CashBalance
			}
			txIndex++
		}

		// --- 2. Calculate Market Value ---
		marketValueAssets := 0.0

		// Debug logging specifically for your crash dates
		enableDebugLog := (dateStr == "2025-06-05" || dateStr == "2025-06-06")
		if enableDebugLog {
			fmt.Printf("\n--- DEBUG DATE: %s ---\n", dateStr)
		}

		for isin, info := range holdings {
			if info.Quantity <= 0.0001 {
				continue
			}

			// A. Resolve Price (Fill-Forward)
			price := 0.0
			if pMap, ok := tickerPrices[isin]; ok {
				price = pMap[dateStr]
			}
			if price > 0 {
				lastKnownPrices[isin] = price
			} else if lastPrice, exists := lastKnownPrices[isin]; exists {
				price = lastPrice
			}

			// B. Resolve Currency & Rate (THE FIX)
			// Instead of info.Currency (Transaction Currency), we use the Ticker Currency
			pricingCurrency := info.Currency // Default fallback
			if mapping, ok := mappings[isin]; ok && mapping.Currency != "" {
				pricingCurrency = mapping.Currency // Use the currency Yahoo gave us (e.g., HKD)
			}

			rate := 1.0
			rateSource := "EUR-BASE"

			if pricingCurrency != "EUR" {
				foundRate := false
				if rMap, ok := currencyRates[pricingCurrency]; ok {
					if r, ok := rMap[dateStr]; ok {
						rate = r
						foundRate = true
						rateSource = "LIVE"
					}
				}
				if !foundRate {
					if lastRate, exists := lastKnownRates[pricingCurrency]; exists {
						rate = lastRate
						rateSource = "FILLED"
					}
				}
				if rate > 0 {
					lastKnownRates[pricingCurrency] = rate
				}
			}

			// C. Calculate
			var assetValue float64
			if price > 0 {
				assetValue = (info.Quantity * price) * rate
			} else {
				assetValue = info.TotalCostBasis
			}
			marketValueAssets += assetValue

			if enableDebugLog {
				fmt.Printf("ASSET: %s | ISIN: %s | PriceCur: %s | Qty: %.2f | Price: %.2f | Rate: %.4f (%s) | VAL: %.2f\n",
					info.Name, isin, pricingCurrency, info.Quantity, price, rate, rateSource, assetValue)
			}
		}

		snapshots = append(snapshots, Snapshot{
			Date:        dateStr,
			Equity:      marketValueAssets + currentCash,
			NetInvested: cumulativeNetInvested,
			Cash:        currentCash,
		})
	}

	// F. Persistence
	if len(snapshots) == 0 {
		return nil
	}

	_, err = database.DB.Exec("DELETE FROM portfolio_snapshots WHERE user_id = ?", userID)
	if err != nil {
		return err
	}

	chunkSize := 500
	for i := 0; i < len(snapshots); i += chunkSize {
		end := i + chunkSize
		if end > len(snapshots) {
			end = len(snapshots)
		}
		batch := snapshots[i:end]
		query := "INSERT INTO portfolio_snapshots (user_id, date, total_equity, cumulative_net_cashflow, cash_balance) VALUES "
		vals := []interface{}{}
		for _, s := range batch {
			query += "(?, ?, ?, ?, ?),"
			vals = append(vals, userID, s.Date, s.Equity, s.NetInvested, s.Cash)
		}
		query = query[:len(query)-1]
		if _, err := database.DB.Exec(query, vals...); err != nil {
			logger.L.Error("Batch insert failed", "error", err)
			return err
		}
	}

	logger.L.Info("History rebuild complete", "days", len(snapshots))
	return nil
}

func (s *uploadServiceImpl) GetCurrentHoldingsWithValue(userID int64) ([]models.HoldingWithValue, error) {
	holdingsByYear, err := s.GetStockHoldings(userID)
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
		logger.L.Warn("Could not fetch some or all current prices", "error", err)
	}
	response := []models.HoldingWithValue{}
	for isin, holding := range groupedHoldings {
		priceInfo, found := prices[isin]
		currentPrice := 0.0
		marketValue := math.Abs(holding.TotalCostBasisEUR)
		status := "UNAVAILABLE"
		if found && priceInfo.Status == "OK" {
			status = "OK"
			currentPrice = priceInfo.Price
			marketValue = priceInfo.Price * float64(holding.TotalQuantity)
		}
		response = append(response, models.HoldingWithValue{
			ISIN:              holding.ISIN,
			ProductName:       holding.ProductName,
			Quantity:          holding.TotalQuantity,
			TotalCostBasisEUR: math.Abs(holding.TotalCostBasisEUR),
			CurrentPriceEUR:   currentPrice,
			MarketValueEUR:    marketValue,
			Status:            status,
		})
	}
	return response, nil
}

func (s *uploadServiceImpl) UpdateUserPortfolioMetrics(userID int64) error {
	s.InvalidateUserCache(userID)
	_, holdingsByYear, err := s.getStockData(userID)
	if err != nil {
		return err
	}
	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	currentLots := holdingsByYear[latestYear]
	if len(currentLots) == 0 {
		database.DB.Exec("UPDATE users SET portfolio_value_eur = 0, top_5_holdings = '[]' WHERE id = ?", userID)
		return nil
	}
	type aggHolding struct {
		ISIN        string
		ProductName string
		Quantity    int
	}
	groupedHoldings := make(map[string]aggHolding)
	for _, lot := range currentLots {
		agg, exists := groupedHoldings[lot.ISIN]
		if !exists {
			agg = aggHolding{ISIN: lot.ISIN, ProductName: lot.ProductName}
		}
		agg.Quantity += lot.Quantity
		groupedHoldings[lot.ISIN] = agg
	}
	uniqueISINs := make([]string, 0, len(groupedHoldings))
	for isin := range groupedHoldings {
		if len(isin) == 12 {
			uniqueISINs = append(uniqueISINs, isin)
		}
	}
	prices, _ := s.priceService.GetCurrentPrices(uniqueISINs)
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
	sort.Slice(valuedHoldings, func(i, j int) bool {
		return valuedHoldings[i].Value > valuedHoldings[j].Value
	})
	top5 := valuedHoldings
	if len(top5) > 5 {
		top5 = top5[:5]
	}
	top5JSON, _ := json.Marshal(top5)
	database.DB.Exec(
		"UPDATE users SET portfolio_value_eur = ?, top_5_holdings = ? WHERE id = ?",
		totalPortfolioValue, string(top5JSON), userID,
	)
	return nil
}

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
}

func (s *uploadServiceImpl) getStockData(userID int64) ([]models.SaleDetail, map[string][]models.PurchaseLot, error) {
	salesCacheKey := fmt.Sprintf(ckAllStockSales, userID)
	holdingsByYearCacheKey := fmt.Sprintf(ckStockHoldingsByYear, userID)
	if cachedSales, salesFound := s.reportCache.Get(salesCacheKey); salesFound {
		if cachedHoldings, holdingsFound := s.reportCache.Get(holdingsByYearCacheKey); holdingsFound {
			return cachedSales.([]models.SaleDetail), cachedHoldings.(map[string][]models.PurchaseLot), nil
		}
	}
	allUserTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, nil, err
	}
	allSales, holdingsByYear := s.stockProcessor.Process(allUserTransactions)
	s.reportCache.Set(salesCacheKey, allSales, cache.NoExpiration)
	s.reportCache.Set(holdingsByYearCacheKey, holdingsByYear, cache.NoExpiration)
	return allSales, holdingsByYear, nil
}

func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	cacheKey := fmt.Sprintf(ckLatestUploadResult, userID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.(*UploadResult), nil
	}
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
		return cached.([]models.FeeDetail), nil
	}
	allUserTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	feeDetails := s.feeProcessor.Process(allUserTransactions)
	s.reportCache.Set(cacheKey, feeDetails, cache.NoExpiration)
	return feeDetails, nil
}

func (s *uploadServiceImpl) GetStockSaleDetails(userID int64) ([]models.SaleDetail, error) {
	sales, _, err := s.getStockData(userID)
	return sales, err
}

func (s *uploadServiceImpl) GetStockHoldings(userID int64) (map[string][]models.PurchaseLot, error) {
	_, holdingsByYear, err := s.getStockData(userID)
	return holdingsByYear, err
}

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

func (s *uploadServiceImpl) GetHistoricalChartData(userID int64) ([]models.HistoricalDataPoint, error) {
	rows, err := database.DB.Query(`
        SELECT date, total_equity, cumulative_net_cashflow
        FROM portfolio_snapshots
        WHERE user_id = ?
        ORDER BY date ASC`, userID)
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
	bmPrices, err := model.GetPricesByTicker(database.DB, "SPY")
	if err != nil {
		return snapshots, nil
	}
	currentBenchmarkUnits := 0.0
	previousCashFlow := 0.0
	lastKnownPrice := 0.0
	for i := range snapshots {
		date := snapshots[i].Date
		price := bmPrices[date]
		if price > 0 {
			lastKnownPrice = price
		} else if lastKnownPrice > 0 {
			price = lastKnownPrice
		} else {
			previousCashFlow = snapshots[i].CumulativeCashFlow
			continue
		}
		dailyNetFlow := snapshots[i].CumulativeCashFlow - previousCashFlow
		if price > 0 {
			unitsBought := dailyNetFlow / price
			currentBenchmarkUnits += unitsBought
		}
		snapshots[i].BenchmarkValue = currentBenchmarkUnits * price
		previousCashFlow = snapshots[i].CumulativeCashFlow
	}
	return snapshots, nil
}

func fetchUserProcessedTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	logger.L.Debug("Fetching processed transactions from DB", "userID", userID)
	query := `
		SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
		       transaction_type, transaction_subtype, buy_sell, description, amount, 
		       currency, commission, order_id, exchange_rate, amount_eur, country_code, 
		       input_string, hash_id, cash_balance, balance_currency 
		FROM processed_transactions 
		WHERE user_id = ? 
		ORDER BY 
			SUBSTR(date, 7, 4) || '-' || SUBSTR(date, 4, 2) || '-' || SUBSTR(date, 1, 2) ASC, 
			id ASC`
	rows, err := database.DB.Query(query, userID)
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
