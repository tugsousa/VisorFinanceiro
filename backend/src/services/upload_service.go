package services

import (
	"fmt"
	"io"
	"log"
	"strings"
	"time" // Ensure time is imported

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
)

// uploadServiceImpl implements the UploadService interface.
type uploadServiceImpl struct {
	csvParser             parsers.CSVParser
	transactionProcessor  parsers.TransactionProcessor
	dividendProcessor     processors.DividendProcessor
	stockProcessor        processors.StockProcessor
	optionProcessor       processors.OptionProcessor
	cashMovementProcessor processors.CashMovementProcessor

	// Store the latest result and the transactions that generated it
	// These are global to the service instance, not per-user, which might be an issue for concurrency.
	// Consider how these should behave if multiple users upload simultaneously.
	// For now, they store the result of the absolute last upload processed by this service instance.
	latestResult                *UploadResult
	latestRawTransactions       []models.RawTransaction
	latestProcessedTransactions []models.ProcessedTransaction
}

// NewUploadService creates a new instance of UploadService with its dependencies.
func NewUploadService(
	csvParser parsers.CSVParser,
	transactionProcessor parsers.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor,
) UploadService {
	return &uploadServiceImpl{
		csvParser:             csvParser,
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor,
	}
}

// ProcessUpload handles the core logic of parsing the file and processing transactions.
func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error) {
	overallStartTime := time.Now() // DECLARED HERE
	log.Printf("ProcessUpload START for userID %d", userID)

	// 1. Parse CSV file
	startTime := time.Now()
	rawTransactions, err := s.csvParser.Parse(fileReader)
	log.Printf("Step 1 (CSV Parsing) took: %s for %d raw transactions", time.Since(startTime), len(rawTransactions))
	if err != nil {
		return nil, fmt.Errorf("error parsing csv file: %w", err)
	}

	// 2. Process RawTransaction into ProcessedTransaction
	startTime = time.Now()
	processedTransactions, err := s.transactionProcessor.Process(rawTransactions)
	log.Printf("Step 2 (Raw to Processed) took: %s for %d processed transactions", time.Since(startTime), len(processedTransactions))
	if err != nil {
		return nil, fmt.Errorf("error processing raw transactions: %w", err)
	}

	// 3. Calculate dividends
	startTime = time.Now()
	dividendResult := s.dividendProcessor.Calculate(processedTransactions)
	log.Printf("Step 3 (Dividends) took: %s", time.Since(startTime))

	// 4. Process stock transactions
	startTime = time.Now()
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(processedTransactions)
	log.Printf("Step 4 (Stocks) took: %s", time.Since(startTime))

	// 5. Process option transactions
	startTime = time.Now()
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(processedTransactions)
	log.Printf("Step 5 (Options) took: %s", time.Since(startTime))

	// 6. Process cash movements
	startTime = time.Now()
	cashMovements := s.cashMovementProcessor.Process(processedTransactions)
	log.Printf("Step 6 (Cash Movements) took: %s", time.Since(startTime))

	result := &UploadResult{
		DividendResult:    dividendResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements,
	}

	// Store the latest result and transactions with userID before returning
	// Be mindful that these are instance-wide, not user-specific in memory.
	s.latestResult = result
	s.latestRawTransactions = rawTransactions
	s.latestProcessedTransactions = processedTransactions

	// Store transactions in database
	startTime = time.Now()
	dbTx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error beginning transaction: %v", err)
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	defer dbTx.Rollback()

	stmt, err := dbTx.Prepare(`
        INSERT INTO processed_transactions
        (user_id, date, product_name, isin, quantity, original_quantity, price, order_type,
         transaction_type, description, amount, currency, commission, order_id,
         exchange_rate, amount_eur, country_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		log.Printf("Error preparing statement: %v", err)
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	for i, tx := range processedTransactions { // Added index i for logging if needed
		_, err := stmt.Exec(
			userID, tx.Date, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
			tx.OrderType, tx.TransactionType, tx.Description, tx.Amount, tx.Currency,
			tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode)
		if err != nil {
			log.Printf("Error inserting transaction into database (OrderID: %s, index: %d): %v", tx.OrderID, i, err)
			return nil, fmt.Errorf("error inserting processed transaction (OrderID: %s): %w", tx.OrderID, err)
		}
	}

	if err := dbTx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		return nil, fmt.Errorf("error committing processed transactions to database: %w", err)
	}
	log.Printf("Step 7 (Database Insert) took: %s for %d transactions", time.Since(startTime), len(processedTransactions))

	// Correctly use overallStartTime here
	log.Printf("ProcessUpload END for userID %d. Total time: %s", userID, time.Since(overallStartTime)) // USED HERE
	return result, nil
}

// GetLatestUploadResult returns the most recently processed upload result for a SPECIFIC user.
// This function queries the DB for the user's data and re-processes it.
// This is correct if you want an up-to-date calculation based on all of the user's stored data.
// The `s.latestResult` etc. fields are for the absolute last upload to the *service*, not this specific user.
func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	log.Printf("GetLatestUploadResult START for userID %d", userID)
	overallStartTime := time.Now()

	// Query database for user's processed transactions.
	// IMPORTANT: If a user can have many thousands of transactions, loading ALL of them
	// every time could be slow. Consider if this endpoint needs all data or a summary/recent.
	// The current LIMIT 100 will only process the latest 100, which might give partial results.
	// If you intend to process ALL user transactions, remove LIMIT 100.
	// If it's just a sample or recent, the logic is fine but the name "LatestUploadResult" might be misleading.
	queryStartTime := time.Now()
	rows, err := database.DB.Query(`
		SELECT date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date DESC 
		-- LIMIT 100 -- Consider implications of this limit
        `, userID)
	if err != nil {
		return nil, fmt.Errorf("error querying transactions for userID %d: %w", userID, err)
	}
	defer rows.Close()
	log.Printf("  DB Query for userID %d took: %s", userID, time.Since(queryStartTime))

	var transactions []models.ProcessedTransaction
	scanStartTime := time.Now()
	for rows.Next() {
		var tx models.ProcessedTransaction
		err := rows.Scan(
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if err != nil {
			return nil, fmt.Errorf("error scanning transaction for userID %d: %w", userID, err)
		}
		transactions = append(transactions, tx)
	}
	if err = rows.Err(); err != nil { // Check for errors during iteration
		return nil, fmt.Errorf("error iterating over transaction rows for userID %d: %w", userID, err)
	}
	log.Printf("  Scanning %d transactions for userID %d took: %s", len(transactions), userID, time.Since(scanStartTime))

	if len(transactions) == 0 {
		log.Printf("No processed transactions found in DB for userID %d. Returning empty result.", userID)
		// Return an empty but valid UploadResult, or an error if preferred.
		return &UploadResult{
			DividendResult:    make(processors.DividendResult), // Ensure maps are initialized
			StockSaleDetails:  []models.SaleDetail{},
			StockHoldings:     []models.PurchaseLot{},
			OptionSaleDetails: []models.OptionSaleDetail{},
			OptionHoldings:    []models.OptionHolding{},
			CashMovements:     []models.CashMovement{},
		}, nil // Or perhaps fmt.Errorf("no transactions found for user %d", userID)
	}

	// Process transactions to generate result
	processingStartTime := time.Now()
	dividendResult := s.dividendProcessor.Calculate(transactions)
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(transactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(transactions)
	cashMovements := s.cashMovementProcessor.Process(transactions)
	log.Printf("  Reprocessing %d transactions for userID %d took: %s", len(transactions), userID, time.Since(processingStartTime))

	uploadResult := &UploadResult{
		DividendResult:    dividendResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements,
	}
	log.Printf("GetLatestUploadResult END for userID %d. Total time: %s", userID, time.Since(overallStartTime))
	return uploadResult, nil
}

// GetDividendTaxSummary uses the service's LATEST processed transactions (from any user).
// This might not be what you intend if the API is per-user.
// If this endpoint should be user-specific, it needs to fetch and process that user's data.
func (s *uploadServiceImpl) GetDividendTaxSummary() (models.DividendTaxResult, error) {
	log.Printf("GetDividendTaxSummary called.")
	if s.latestProcessedTransactions == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot generate dividend tax summary")
	}
	// This uses the transactions from the very last upload processed by the service instance.
	taxSummary := s.dividendProcessor.CalculateTaxSummary(s.latestProcessedTransactions)
	return taxSummary, nil
}

// GetDividendTransactions uses the service's LATEST processed transactions (from any user).
func (s *uploadServiceImpl) GetDividendTransactions() ([]models.ProcessedTransaction, error) {
	log.Printf("GetDividendTransactions called.")
	if s.latestProcessedTransactions == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot retrieve dividend transactions")
	}

	dividends := []models.ProcessedTransaction{}
	for _, tx := range s.latestProcessedTransactions {
		if tx.OrderType != "" && strings.ToLower(tx.OrderType) == "dividend" {
			dividends = append(dividends, tx)
		}
	}
	return dividends, nil
}

// GetRawTransactions uses the service's LATEST raw transactions (from any user).
func (s *uploadServiceImpl) GetRawTransactions() ([]models.RawTransaction, error) {
	log.Printf("GetRawTransactions called.")
	if s.latestRawTransactions == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot retrieve raw transactions")
	}
	return s.latestRawTransactions, nil
}

// GetProcessedTransactions uses the service's LATEST processed transactions (from any user).
func (s *uploadServiceImpl) GetProcessedTransactions() ([]models.ProcessedTransaction, error) {
	log.Printf("GetProcessedTransactions called.")
	if s.latestProcessedTransactions == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot retrieve processed transactions")
	}
	return s.latestProcessedTransactions, nil
}

// GetStockHoldings uses the service's LATEST result (from any user).
func (s *uploadServiceImpl) GetStockHoldings() ([]models.PurchaseLot, error) {
	log.Printf("GetStockHoldings called.")
	if s.latestResult == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot retrieve stock holdings")
	}
	return s.latestResult.StockHoldings, nil
}

// GetOptionHoldings uses the service's LATEST result (from any user).
func (s *uploadServiceImpl) GetOptionHoldings() ([]models.OptionHolding, error) {
	log.Printf("GetOptionHoldings called.")
	if s.latestResult == nil {
		return nil, fmt.Errorf("no upload processed yet (service-wide), cannot retrieve option holdings")
	}
	return s.latestResult.OptionHoldings, nil
}
