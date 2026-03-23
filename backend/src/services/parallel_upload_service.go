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
		ISINResolutionWorkers:   5,
		PriceFetchingWorkers:    3,
		MetadataFetchingWorkers: 2,
		DatabaseBatchSize:       1000,
		MaxConcurrentJobs:       5,
		ProgressUpdateInterval:  2 * time.Second,
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

	// Step 1: Parse file (sequential, as it's fast)
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

	// Step 2: Process transactions (sequential, as it's business logic)
	newlyProcessedTxs := pus.transactionProc.Process(canonicalTxs)
	if len(newlyProcessedTxs) == 0 {
		return &ParallelUploadResult{
			StartTime: startTime,
			EndTime:   time.Now(),
		}, nil
	}

	// Step 3: Extract unique ISINs for parallel processing
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

	// Step 4: Parallel ISIN resolution, price fetching, and metadata fetching
	websocket.BroadcastUploadProgress(userID, portfolioID, 25, 100, "parallel_processing", "Resolvendo ISINs e buscando preços")

	result := &ParallelUploadResult{
		ProcessedTransactions: newlyProcessedTxs,
		ISINResolutionErrors:  make(map[string]error),
		PriceFetchingErrors:   make(map[string]error),
		MetadataErrors:        make(map[string]error),
		TotalISINs:            len(isinList),
		StartTime:             startTime,
	}

	// Start progress tracking goroutine
	progressDone := make(chan struct{})
	go pus.trackProgress(userID, portfolioID, progressDone)

	// Execute parallel operations
	err = pus.executeParallelOperations(isinList, result)
	if err != nil {
		logger.L.Error("Parallel operations failed", "error", err, "userID", userID, "portfolioID", portfolioID)
	}

	// Stop progress tracking
	close(progressDone)

	// Step 5: Database operations with batching
	websocket.BroadcastUploadProgress(userID, portfolioID, 75, 100, "database", "Salvando transações no banco de dados")

	err = pus.batchDatabaseInsert(newlyProcessedTxs, userID, portfolioID, source, filename, filesize)
	if err != nil {
		return nil, fmt.Errorf("database insert failed: %w", err)
	}

	// Step 6: Start background jobs
	websocket.BroadcastUploadProgress(userID, portfolioID, 90, 100, "background_jobs", "Iniciando processos em segundo plano")

	go pus.startBackgroundJobs(userID, portfolioID)

	result.EndTime = time.Now()
	websocket.BroadcastUploadProgress(userID, portfolioID, 100, 100, "completed", "Upload concluído com sucesso")

	return result, nil
}

// executeParallelOperations executes ISIN resolution, price fetching, and metadata fetching in parallel
func (pus *ParallelUploadService) executeParallelOperations(isinList []string, result *ParallelUploadResult) error {
	var wg sync.WaitGroup
	var mu sync.Mutex

	// Channel-based worker pools
	isinChan := make(chan string, len(isinList))
	priceChan := make(chan string, len(isinList))
	metadataChan := make(chan string, len(isinList))

	// Send ISINs to channels
	for _, isin := range isinList {
		isinChan <- isin
		priceChan <- isin
		metadataChan <- isin
	}
	close(isinChan)
	close(priceChan)
	close(metadataChan)

	// Start ISIN resolution workers
	for i := 0; i < pus.config.ISINResolutionWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.isinResolutionWorker(isinChan, result, &mu)
		}()
	}

	// Start price fetching workers
	for i := 0; i < pus.config.PriceFetchingWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.priceFetchingWorker(priceChan, result, &mu)
		}()
	}

	// Start metadata fetching workers
	for i := 0; i < pus.config.MetadataFetchingWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			pus.metadataWorker(metadataChan, result, &mu)
		}()
	}

	wg.Wait()
	return nil
}

// isinResolutionWorker processes ISIN resolution in parallel
func (pus *ParallelUploadService) isinResolutionWorker(isinChan <-chan string, result *ParallelUploadResult, mu *sync.Mutex) {
	for isin := range isinChan {
		// Check if already resolved in database
		mappings, err := model.GetMappingsByISINs(database.DB, []string{isin})
		if err != nil {
			mu.Lock()
			result.ISINResolutionErrors[isin] = fmt.Errorf("database query failed: %w", err)
			mu.Unlock()
			continue
		}

		if _, exists := mappings[isin]; exists {
			mu.Lock()
			result.ResolvedISINs++
			mu.Unlock()
			continue
		}

		// Resolve ISIN to ticker
		ticker, _, _, err := pus.priceService.FetchTickerForISIN(isin)
		if err != nil {
			mu.Lock()
			result.ISINResolutionErrors[isin] = err
			result.FailedISINs++
			mu.Unlock()
			continue
		}

		// Store mapping
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

// priceFetchingWorker processes price fetching in parallel
func (pus *ParallelUploadService) priceFetchingWorker(isinChan <-chan string, result *ParallelUploadResult, mu *sync.Mutex) {
	for isin := range isinChan {
		// Get ticker from database
		mappings, err := model.GetMappingsByISINs(database.DB, []string{isin})
		if err != nil || len(mappings) == 0 {
			continue
		}

		ticker := mappings[isin].TickerSymbol
		if ticker == "" {
			continue
		}

		// Fetch current price
		prices, err := pus.priceService.GetCurrentPrices([]string{isin})
		if err != nil {
			mu.Lock()
			result.PriceFetchingErrors[ticker] = err
			mu.Unlock()
			continue
		}

		if priceInfo, exists := prices[isin]; exists && priceInfo.Status == "OK" {
			// Store price
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

// metadataWorker processes metadata fetching in parallel
func (pus *ParallelUploadService) metadataWorker(isinChan <-chan string, result *ParallelUploadResult, mu *sync.Mutex) {
	for isin := range isinChan {
		// Get ticker from database
		mappings, err := model.GetMappingsByISINs(database.DB, []string{isin})
		if err != nil || len(mappings) == 0 {
			continue
		}

		ticker := mappings[isin].TickerSymbol
		if ticker == "" {
			continue
		}

		// Fetch metadata
		sector, industry, quoteType, err := pus.priceService.FetchMetadata(ticker)
		if err != nil {
			mu.Lock()
			result.MetadataErrors[ticker] = err
			mu.Unlock()
			continue
		}

		// Update mapping with metadata
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

	// Start transaction
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Prepare insert statement
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

	// Batch insert
	batchSize := pus.config.DatabaseBatchSize
	insertedCount := 0

	for i := 0; i < len(transactions); i += batchSize {
		end := i + batchSize
		if end > len(transactions) {
			end = len(transactions)
		}

		batch := transactions[i:end]

		for _, tx := range batch {
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
				return fmt.Errorf("error inserting transaction (OrderID: %s): %w", tx.OrderID, err)
			}
			insertedCount++
		}
	}

	// Insert upload history
	_, err = tx.Exec(`
		INSERT INTO uploads_history (user_id, portfolio_id, source, filename, file_size, transaction_count) 
		VALUES (?, ?, ?, ?, ?, ?)`,
		userID, portfolioID, source, filename, filesize, insertedCount,
	)
	if err != nil {
		return fmt.Errorf("failed to record upload in history: %w", err)
	}

	// Update user upload counts
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

	// Commit transaction
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

// startBackgroundJobs starts background jobs with prioritization
func (pus *ParallelUploadService) startBackgroundJobs(userID int64, portfolioID int64) {
	logger.L.Info("Starting prioritized background jobs", "userID", userID, "portfolioID", portfolioID)

	// 1. Cache warming (highest priority - improves user experience immediately)
	go func() {
		_, err := pus.uploadService.jobManager.CacheWarmingAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start cache warming job", "userID", userID, "error", err)
		}
	}()

	// 2. Metrics update (medium priority - needed for dashboard)
	go func() {
		_, err := pus.uploadService.jobManager.UpdateMetricsAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start metrics update job", "userID", userID, "error", err)
		}
	}()

	// 3. Dividend calculation (medium priority - needed for tax reports)
	go func() {
		_, err := pus.uploadService.jobManager.CalculateDividendsAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start dividend calculation job", "userID", userID, "error", err)
		}
	}()

	// 4. History rebuild (lowest priority - background task)
	go func() {
		_, err := pus.uploadService.jobManager.RebuildHistoryAsync(pus.uploadService, userID, portfolioID)
		if err != nil {
			logger.L.Error("Failed to start history rebuild job", "userID", userID, "error", err)
		}
	}()
}
