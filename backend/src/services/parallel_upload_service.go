package services

import (
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/websocket"
)

// ParallelUploadConfig holds configuration for parallel upload operations
type ParallelUploadConfig struct {
	ISINResolutionWorkers   int
	PriceFetchingWorkers    int
	MetadataFetchingWorkers int
	DatabaseBatchSize       int
	MaxConcurrentJobs       int
	ProgressUpdateInterval  time.Duration
}

// DefaultParallelUploadConfig returns a default configuration
func DefaultParallelUploadConfig() *ParallelUploadConfig {
	return &ParallelUploadConfig{
		ISINResolutionWorkers:   10,
		PriceFetchingWorkers:    6,
		MetadataFetchingWorkers: 4,
		DatabaseBatchSize:       2000,
		MaxConcurrentJobs:       8,
		ProgressUpdateInterval:  1 * time.Second,
	}
}

// ParallelUploadService provides parallelized upload operations
type ParallelUploadService struct {
	uploadService   *uploadServiceImpl
	priceService    PriceService
	transactionProc *processors.TransactionProcessor
	config          *ParallelUploadConfig
}

// NewParallelUploadService creates a new parallel upload service
func NewParallelUploadService(
	uploadService *uploadServiceImpl,
	priceService PriceService,
	transactionProc *processors.TransactionProcessor,
	config *ParallelUploadConfig,
) *ParallelUploadService {
	if config == nil {
		config = DefaultParallelUploadConfig()
	}
	return &ParallelUploadService{
		uploadService:   uploadService,
		priceService:    priceService,
		transactionProc: transactionProc,
		config:          config,
	}
}

// ParallelUploadResult contains the results of a parallel upload
type ParallelUploadResult struct {
	ProcessedTransactions []models.ProcessedTransaction
	ISINResolutionErrors  map[string]error
	PriceFetchingErrors   map[string]error
	MetadataErrors        map[string]error
	TotalISINs            int
	ResolvedISINs         int
	FailedISINs           int
	StartTime             time.Time
	EndTime               time.Time
}

// ProcessUploadParallel processes an upload with parallel operations
func (pus *ParallelUploadService) ProcessUploadParallel(
	fileReader io.Reader,
	userID int64,
	portfolioID int64,
	source, filename string,
	filesize int64,
) (*ParallelUploadResult, error) {
	startTime := time.Now()

	websocket.BroadcastUploadProgress(userID, portfolioID, 5, 100, "parsing", "Analisando arquivo CSV")

	parser, err := parsers.GetParser(source)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	canonicalTxs, err := parser.Parse(fileReader)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParsingFailed, err)
	}

	websocket.BroadcastUploadProgress(userID, portfolioID, 15, 100, "processing", "Processando transações")

	newlyProcessedTxs := pus.transactionProc.Process(canonicalTxs)
	if len(newlyProcessedTxs) == 0 {
		return &ParallelUploadResult{
			StartTime: startTime,
			EndTime:   time.Now(),
		}, nil
	}

	// Extract unique ISINs
	uniqueISINs := make(map[string]bool)
	for _, tx := range newlyProcessedTxs {
		if len(tx.ISIN) == 12 {
			uniqueISINs[tx.ISIN] = true
		}
	}

	isinList := make([]string, 0, len(uniqueISINs))
	for isin := range uniqueISINs {
		isinList = append(isinList, isin)
	}

	websocket.BroadcastUploadProgress(userID, portfolioID, 25, 100, "parallel_processing", "Resolvendo ISINs e buscando preços")

	result := &ParallelUploadResult{
		ProcessedTransactions: newlyProcessedTxs,
		ISINResolutionErrors:  make(map[string]error),
		PriceFetchingErrors:   make(map[string]error),
		MetadataErrors:        make(map[string]error),
		TotalISINs:            len(isinList),
		StartTime:             startTime,
	}

	progressDone := make(chan struct{})
	go pus.trackProgress(userID, portfolioID, progressDone)

	// FIX #3: do the bulk DB lookup once here, then pass the results map into
	// the workers so each worker no longer needs its own individual DB query.
	bulkMappings, err := model.GetMappingsByISINs(database.DB, isinList)
	if err != nil {
		logger.L.Error("Failed to bulk-fetch ISIN mappings before workers", "error", err, "userID", userID)
		// Non-fatal: workers will fall back to their own individual lookups.
		bulkMappings = make(map[string]model.ISINTickerMap)
	}

	err = pus.executeParallelOperations(isinList, bulkMappings, result)
	if err != nil {
		logger.L.Error("Parallel operations failed", "error", err, "userID", userID, "portfolioID", portfolioID)
	}

	close(progressDone)

	websocket.BroadcastUploadProgress(userID, portfolioID, 75, 100, "database", "Salvando transações no banco de dados")

	// FIX #7: determine the earliest new transaction date for incremental rebuild.
	var earliestNewTxDate string
	for _, tx := range newlyProcessedTxs {
		if earliestNewTxDate == "" || tx.Date < earliestNewTxDate {
			earliestNewTxDate = tx.Date
		}
	}

	err = pus.batchDatabaseInsert(newlyProcessedTxs, userID, portfolioID, source, filename, filesize)
	if err != nil {
		return nil, fmt.Errorf("database insert failed: %w", err)
	}

	websocket.BroadcastUploadProgress(userID, portfolioID, 90, 100, "background_jobs", "Iniciando processos em segundo plano")

	// FIX #7: pass earliestNewTxDate so the background rebuild is incremental.
	go pus.startBackgroundJobs(userID, portfolioID, earliestNewTxDate)

	result.EndTime = time.Now()
	websocket.BroadcastUploadProgress(userID, portfolioID, 100, 100, "completed", "Upload concluído com sucesso")

	return result, nil
}

// executeParallelOperations executes ISIN resolution, price fetching, and metadata fetching in parallel.
// FIX #3: accepts the pre-fetched bulkMappings map so workers skip per-ISIN DB queries for
// ISINs that are already known.
func (pus *ParallelUploadService) executeParallelOperations(
	isinList []string,
	bulkMappings map[string]model.ISINTickerMap,
	result *ParallelUploadResult,
) error {
	var wg sync.WaitGroup
	var mu sync.Mutex

	isinChan := make(chan string, len(isinList))
	priceChan := make(chan string, len(isinList))
	metadataChan := make(chan string, len(isinList))

	for _, isin := range isinList {
		isinChan <- isin
		priceChan <- isin
		metadataChan <- isin
	}
	close(isinChan)
	close(priceChan)
	close(metadataChan)

	for i := 0; i < pus.config.ISINResolutionWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.isinResolutionWorker(isinChan, bulkMappings, result, &mu)
		}()
	}

	for i := 0; i < pus.config.PriceFetchingWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.priceFetchingWorker(priceChan, bulkMappings, result, &mu)
		}()
	}

	for i := 0; i < pus.config.MetadataFetchingWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.metadataWorker(metadataChan, bulkMappings, result, &mu)
		}()
	}

	wg.Wait()
	return nil
}

// isinResolutionWorker processes ISIN resolution in parallel.
// FIX #3: uses the pre-fetched bulkMappings instead of one DB query per ISIN.
func (pus *ParallelUploadService) isinResolutionWorker(
	isinChan <-chan string,
	bulkMappings map[string]model.ISINTickerMap,
	result *ParallelUploadResult,
	mu *sync.Mutex,
) {
	for isin := range isinChan {
		// FIX #3: use bulk map instead of a fresh DB query per ISIN.
		if _, exists := bulkMappings[isin]; exists {
			mu.Lock()
			result.ResolvedISINs++
			mu.Unlock()
			continue
		}

		// Not in bulk map — need to resolve via API.
		ticker, _, _, err := pus.priceService.FetchTickerForISIN(isin)
		if err != nil {
			mu.Lock()
			result.ISINResolutionErrors[isin] = err
			result.FailedISINs++
			mu.Unlock()
			continue
		}

		mapping := model.ISINTickerMap{
			ISIN:         isin,
			TickerSymbol: ticker,
		}
		err = model.InsertMapping(database.DB, mapping)
		if err != nil {
			mu.Lock()
			result.ISINResolutionErrors[isin] = fmt.Errorf("failed to store mapping: %w", err)
			mu.Unlock()
			continue
		}

		mu.Lock()
		result.ResolvedISINs++
		mu.Unlock()
	}
}

// priceFetchingWorker processes price fetching in parallel.
// FIX #3: uses the pre-fetched bulkMappings instead of one DB query per ISIN.
func (pus *ParallelUploadService) priceFetchingWorker(
	isinChan <-chan string,
	bulkMappings map[string]model.ISINTickerMap,
	result *ParallelUploadResult,
	mu *sync.Mutex,
) {
	for isin := range isinChan {
		// FIX #3: look up ticker in the pre-fetched map.
		mapping, exists := bulkMappings[isin]
		if !exists || mapping.TickerSymbol == "" {
			continue
		}
		ticker := mapping.TickerSymbol

		prices, err := pus.priceService.GetCurrentPrices([]string{isin})
		if err != nil {
			mu.Lock()
			result.PriceFetchingErrors[ticker] = err
			mu.Unlock()
			continue
		}

		if priceInfo, ok := prices[isin]; ok && priceInfo.Status == "OK" {
			dailyPrice := model.DailyPrice{
				TickerSymbol: ticker,
				Date:         time.Now().Format("2006-01-02"),
				Price:        priceInfo.Price,
				Currency:     priceInfo.Currency,
			}
			err = model.InsertOrUpdatePrice(database.DB, dailyPrice)
			if err != nil {
				mu.Lock()
				result.PriceFetchingErrors[ticker] = fmt.Errorf("failed to store price: %w", err)
				mu.Unlock()
			}
		}
	}
}

// metadataWorker processes metadata fetching in parallel.
// FIX #3: uses the pre-fetched bulkMappings instead of one DB query per ISIN.
func (pus *ParallelUploadService) metadataWorker(
	isinChan <-chan string,
	bulkMappings map[string]model.ISINTickerMap,
	result *ParallelUploadResult,
	mu *sync.Mutex,
) {
	for isin := range isinChan {
		// FIX #3: look up ticker in the pre-fetched map.
		mapping, exists := bulkMappings[isin]
		if !exists || mapping.TickerSymbol == "" {
			continue
		}
		ticker := mapping.TickerSymbol

		sector, industry, quoteType, err := pus.priceService.FetchMetadata(ticker)
		if err != nil {
			mu.Lock()
			result.MetadataErrors[ticker] = err
			mu.Unlock()
			continue
		}

		err = model.UpdateMappingMetadata(database.DB, isin, sector, industry, quoteType)
		if err != nil {
			mu.Lock()
			result.MetadataErrors[ticker] = fmt.Errorf("failed to update metadata: %w", err)
			mu.Unlock()
		}
	}
}

// batchDatabaseInsert performs batch database insertion with optimized transactions
func (pus *ParallelUploadService) batchDatabaseInsert(
	transactions []models.ProcessedTransaction,
	userID int64,
	portfolioID int64,
	source, filename string,
	filesize int64,
) error {
	if len(transactions) == 0 {
		return nil
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO processed_transactions 
		(user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity, price, 
		transaction_type, transaction_subtype, buy_sell, description, amount, currency, 
		commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id,
		cash_balance, balance_currency) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("failed to prepare insert statement: %w", err)
	}
	defer stmt.Close()

	batchSize := pus.config.DatabaseBatchSize
	insertedCount := 0

	for i := 0; i < len(transactions); i += batchSize {
		end := i + batchSize
		if end > len(transactions) {
			end = len(transactions)
		}

		batch := transactions[i:end]

		for _, ptx := range batch {
			_, err := stmt.Exec(
				userID, portfolioID, ptx.Date, ptx.Source, ptx.ProductName, ptx.ISIN, ptx.Quantity, ptx.OriginalQuantity, ptx.Price,
				ptx.TransactionType, ptx.TransactionSubType, ptx.BuySell, ptx.Description, ptx.Amount, ptx.Currency,
				ptx.Commission, ptx.OrderID, ptx.ExchangeRate, ptx.AmountEUR, ptx.CountryCode, ptx.InputString, ptx.HashId,
				ptx.CashBalance, ptx.BalanceCurrency,
			)
			if err != nil {
				if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
					logger.L.Debug("Skipping duplicate transaction on upload", "userID", userID, "hash_id", ptx.HashId)
					continue
				}
				return fmt.Errorf("error inserting transaction (OrderID: %s): %w", ptx.OrderID, err)
			}
			insertedCount++
		}
	}

	_, err = tx.Exec(`
		INSERT INTO uploads_history (user_id, portfolio_id, source, filename, file_size, transaction_count) 
		VALUES (?, ?, ?, ?, ?, ?)`,
		userID, portfolioID, source, filename, filesize, insertedCount,
	)
	if err != nil {
		return fmt.Errorf("failed to record upload in history: %w", err)
	}

	var newUploadCount int
	err = tx.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ? AND portfolio_id = ?", userID, portfolioID).Scan(&newUploadCount)
	if err != nil {
		return fmt.Errorf("failed to recount distinct sources for user: %w", err)
	}
	_, err = tx.Exec(`
		UPDATE users 
		SET total_upload_count = total_upload_count + 1, upload_count = ?
		WHERE id = ?`,
		newUploadCount, userID,
	)
	if err != nil {
		return fmt.Errorf("failed to update user upload counts: %w", err)
	}

	err = tx.Commit()
	if err != nil {
		return fmt.Errorf("error committing transactions: %w", err)
	}

	return nil
}

// trackProgress tracks and broadcasts upload progress
func (pus *ParallelUploadService) trackProgress(userID int64, portfolioID int64, done chan struct{}) {
	ticker := time.NewTicker(pus.config.ProgressUpdateInterval)
	defer ticker.Stop()

	progress := 25
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			progress += 5
			if progress >= 75 {
				progress = 75
			}
			websocket.BroadcastUploadProgress(userID, portfolioID, progress, 100, "parallel_processing", "Processando em paralelo")
		}
	}
}

// startBackgroundJobs starts background jobs with prioritization.
// FIX #7: accepts fromDate for incremental history rebuild.
func (pus *ParallelUploadService) startBackgroundJobs(userID int64, portfolioID int64, fromDate string) {
	logger.L.Info("Starting prioritized background jobs", "userID", userID, "portfolioID", portfolioID)

	go func() {
		_, err := pus.uploadService.jobManager.CacheWarmingAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start cache warming job", "userID", userID, "error", err)
		}
	}()

	go func() {
		_, err := pus.uploadService.jobManager.UpdateMetricsAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start metrics update job", "userID", userID, "error", err)
		}
	}()

	go func() {
		_, err := pus.uploadService.jobManager.CalculateDividendsAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start dividend calculation job", "userID", userID, "error", err)
		}
	}()

	go func() {
		// FIX #7: pass fromDate so incremental uploads only rebuild the tail.
		_, err := pus.uploadService.jobManager.RebuildHistoryAsync(pus.uploadService, userID, portfolioID, fromDate)
		if err != nil {
			logger.L.Error("Failed to start history rebuild job", "userID", userID, "error", err)
		}
	}()
}
