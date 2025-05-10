// backend/src/services/upload_service.go
package services

import (
	"fmt"
	"io"
	"log"
	"strings"
	"time"

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

	// NOTE: Removed global state for latestResult, latestRawTransactions, latestProcessedTransactions
	// These were problematic for a multi-user system and are now handled per request.
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

// fetchUserProcessedTransactions is a crucial helper to get all relevant data for a user.
// It orders transactions chronologically, which is vital for FIFO and other sequential processing.
func fetchUserProcessedTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	log.Printf("Fetching processed transactions for userID %d", userID)
	startTime := time.Now()

	rows, err := database.DB.Query(`
		SELECT id, date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date ASC, id ASC`, userID) // Order by date, then by id for stability

	if err != nil {
		return nil, fmt.Errorf("error querying transactions for userID %d: %w", userID, err)
	}
	defer rows.Close()

	var transactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID, // Scan the new ID field
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if scanErr != nil {
			log.Printf("Error scanning transaction for userID %d: %v", userID, scanErr)
			return nil, fmt.Errorf("error scanning transaction row for userID %d: %w", userID, scanErr)
		}
		transactions = append(transactions, tx)
	}
	if err = rows.Err(); err != nil { // Check for errors during iteration
		return nil, fmt.Errorf("error iterating over transaction rows for userID %d: %w", userID, err)
	}

	log.Printf("Fetched %d transactions for userID %d in %s", len(transactions), userID, time.Since(startTime))
	return transactions, nil
}

// ProcessUpload handles a new file upload, stores its transactions,
// and returns an UploadResult based *only* on the processed file.
func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error) {
	overallStartTime := time.Now()
	log.Printf("ProcessUpload START for userID %d", userID)

	// 1. Parse CSV file
	parseStartTime := time.Now()
	rawTransactions, err := s.csvParser.Parse(fileReader)
	log.Printf("Step 1 (CSV Parsing) for userID %d took: %s for %d raw transactions", userID, time.Since(parseStartTime), len(rawTransactions))
	if err != nil {
		return nil, fmt.Errorf("error parsing csv file for userID %d: %w", userID, err)
	}
	if len(rawTransactions) == 0 {
		log.Printf("No raw transactions parsed from file for userID %d.", userID)
		// Return an empty result or an error indicating no data
		return &UploadResult{
			DividendTaxResult: make(models.DividendTaxResult),
			StockSaleDetails:  []models.SaleDetail{},
			StockHoldings:     []models.PurchaseLot{},
			OptionSaleDetails: []models.OptionSaleDetail{},
			OptionHoldings:    []models.OptionHolding{},
			CashMovements:     []models.CashMovement{},
		}, nil // Or fmt.Errorf("no transactions found in the uploaded file")
	}

	// 2. Process RawTransaction into ProcessedTransaction
	processStartTime := time.Now()
	processedTransactions, err := s.transactionProcessor.Process(rawTransactions)
	log.Printf("Step 2 (Raw to Processed) for userID %d took: %s for %d processed transactions", userID, time.Since(processStartTime), len(processedTransactions))
	if err != nil {
		return nil, fmt.Errorf("error processing raw transactions for userID %d: %w", userID, err)
	}
	if len(processedTransactions) == 0 {
		log.Printf("No transactions were processed from raw data for userID %d.", userID)
		// This could happen if all raw transactions were skipped due to errors in parseDescription, etc.
		return &UploadResult{
			DividendTaxResult: make(models.DividendTaxResult),
			StockSaleDetails:  []models.SaleDetail{},
			StockHoldings:     []models.PurchaseLot{},
			OptionSaleDetails: []models.OptionSaleDetail{},
			OptionHoldings:    []models.OptionHolding{},
			CashMovements:     []models.CashMovement{},
		}, nil
	}

	// 3. Store processed transactions from THIS BATCH in the database
	dbStoreStartTime := time.Now()
	dbTx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error beginning DB transaction for ProcessUpload userID %d: %v", userID, err)
		return nil, fmt.Errorf("error beginning database transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			dbTx.Rollback() // Ensure rollback if not committed
		}
	}()

	stmt, err := dbTx.Prepare(`
        INSERT INTO processed_transactions
        (user_id, date, product_name, isin, quantity, original_quantity, price, order_type,
         transaction_type, description, amount, currency, commission, order_id,
         exchange_rate, amount_eur, country_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		log.Printf("Error preparing DB statement for ProcessUpload userID %d: %v", userID, err)
		return nil, fmt.Errorf("error preparing insert statement: %w", err)
	}
	defer stmt.Close()

	for _, tx := range processedTransactions { // These are from the current upload only
		_, err := stmt.Exec(
			userID, tx.Date, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
			tx.OrderType, tx.TransactionType, tx.Description, tx.Amount, tx.Currency,
			tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode)
		if err != nil {
			log.Printf("Error inserting transaction (OrderID: %s) for userID %d: %v", tx.OrderID, userID, err)
			// Rollback is handled by defer
			return nil, fmt.Errorf("error inserting processed transaction (OrderID: %s): %w", tx.OrderID, err)
		}
	}

	if err := dbTx.Commit(); err != nil {
		log.Printf("Error committing DB transaction for ProcessUpload userID %d: %v", userID, err)
		return nil, fmt.Errorf("error committing processed transactions to database: %w", err)
	}
	committed = true
	log.Printf("Step 3 (DB Insert) for userID %d took: %s for %d transactions", userID, time.Since(dbStoreStartTime), len(processedTransactions))

	// 4. Calculate results based *only* on the current batch of processedTransactions
	// This provides an immediate summary of what was just uploaded.
	runProcessorsStartTime := time.Now()
	dividendTaxResult := s.dividendProcessor.CalculateTaxSummary(processedTransactions)
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(processedTransactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(processedTransactions)
	cashMovements := s.cashMovementProcessor.Process(processedTransactions)
	log.Printf("Step 4 (Run Processors on batch) for userID %d took: %s", userID, time.Since(runProcessorsStartTime))

	result := &UploadResult{
		DividendTaxResult: dividendTaxResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements,
	}

	log.Printf("ProcessUpload END for userID %d. Total time: %s", userID, time.Since(overallStartTime))
	return result, nil
}

// GetLatestUploadResult provides a comprehensive result based on *all*
// historical transactions for the given user from the database.
func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	log.Printf("GetLatestUploadResult START for userID %d", userID)
	overallStartTime := time.Now()

	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err // Error already formatted by fetchUserProcessedTransactions
	}

	if len(userTransactions) == 0 {
		log.Printf("No transactions found for userID %d in GetLatestUploadResult. Returning empty result.", userID)
		return &UploadResult{
			DividendTaxResult: make(models.DividendTaxResult), // Initialize map
			StockSaleDetails:  []models.SaleDetail{},
			StockHoldings:     []models.PurchaseLot{},
			OptionSaleDetails: []models.OptionSaleDetail{},
			OptionHoldings:    []models.OptionHolding{},
			CashMovements:     []models.CashMovement{},
		}, nil
	}

	// Run processors on the complete set of user's transactions
	processingStartTime := time.Now()
	dividendTaxResult := s.dividendProcessor.CalculateTaxSummary(userTransactions)
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(userTransactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(userTransactions)
	cashMovements := s.cashMovementProcessor.Process(userTransactions)
	log.Printf("  Reprocessing %d transactions for userID %d in GetLatestUploadResult took: %s", len(userTransactions), userID, time.Since(processingStartTime))

	uploadResult := &UploadResult{
		DividendTaxResult: dividendTaxResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements,
	}
	log.Printf("GetLatestUploadResult END for userID %d. Total time: %s", userID, time.Since(overallStartTime))
	return uploadResult, nil
}

// GetDividendTaxSummary processes all historical data for the user.
func (s *uploadServiceImpl) GetDividendTaxSummary(userID int64) (models.DividendTaxResult, error) {
	log.Printf("GetDividendTaxSummary START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	if len(userTransactions) == 0 {
		log.Printf("No transactions for userID %d to generate dividend tax summary.", userID)
		return make(models.DividendTaxResult), nil // Return empty, initialized map
	}
	taxSummary := s.dividendProcessor.CalculateTaxSummary(userTransactions)
	log.Printf("GetDividendTaxSummary END for userID %d", userID)
	return taxSummary, nil
}

// GetDividendTransactions fetches all transactions for the user and filters for dividend types.
func (s *uploadServiceImpl) GetDividendTransactions(userID int64) ([]models.ProcessedTransaction, error) {
	log.Printf("GetDividendTransactions START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}

	dividends := []models.ProcessedTransaction{}
	for _, tx := range userTransactions {
		orderTypeLower := strings.ToLower(tx.OrderType)
		if orderTypeLower == "dividend" || orderTypeLower == "dividendtax" {
			dividends = append(dividends, tx)
		}
	}
	log.Printf("GetDividendTransactions END for userID %d, found %d dividend-related transactions.", userID, len(dividends))
	return dividends, nil
}

// GetStockHoldings processes all historical data for the user.
func (s *uploadServiceImpl) GetStockHoldings(userID int64) ([]models.PurchaseLot, error) {
	log.Printf("GetStockHoldings START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	if len(userTransactions) == 0 {
		log.Printf("No transactions for userID %d to calculate stock holdings.", userID)
		return []models.PurchaseLot{}, nil // Return empty slice
	}
	_, stockHoldings := s.stockProcessor.Process(userTransactions)
	log.Printf("GetStockHoldings END for userID %d, found %d stock holding lots.", userID, len(stockHoldings))
	return stockHoldings, nil
}

// GetOptionHoldings processes all historical data for the user.
func (s *uploadServiceImpl) GetOptionHoldings(userID int64) ([]models.OptionHolding, error) {
	log.Printf("GetOptionHoldings START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	if len(userTransactions) == 0 {
		log.Printf("No transactions for userID %d to calculate option holdings.", userID)
		return []models.OptionHolding{}, nil // Return empty slice
	}
	_, optionHoldings := s.optionProcessor.Process(userTransactions)
	log.Printf("GetOptionHoldings END for userID %d, found %d option holding lots.", userID, len(optionHoldings))
	return optionHoldings, nil
}

// GetStockSaleDetails processes all historical data for the user.
func (s *uploadServiceImpl) GetStockSaleDetails(userID int64) ([]models.SaleDetail, error) {
	log.Printf("GetStockSaleDetails START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	if len(userTransactions) == 0 {
		log.Printf("No transactions for userID %d to calculate stock sale details.", userID)
		return []models.SaleDetail{}, nil // Return empty slice
	}
	stockSaleDetails, _ := s.stockProcessor.Process(userTransactions)
	log.Printf("GetStockSaleDetails END for userID %d, found %d stock sale details.", userID, len(stockSaleDetails))
	return stockSaleDetails, nil
}

// GetOptionSaleDetails processes all historical data for the user.
func (s *uploadServiceImpl) GetOptionSaleDetails(userID int64) ([]models.OptionSaleDetail, error) {
	log.Printf("GetOptionSaleDetails START for userID %d", userID)
	userTransactions, err := fetchUserProcessedTransactions(userID)
	if err != nil {
		return nil, err
	}
	if len(userTransactions) == 0 {
		log.Printf("No transactions for userID %d to calculate option sale details.", userID)
		return []models.OptionSaleDetail{}, nil // Return empty slice
	}
	optionSaleDetails, _ := s.optionProcessor.Process(userTransactions)
	log.Printf("GetOptionSaleDetails END for userID %d, found %d option sale details.", userID, len(optionSaleDetails))
	return optionSaleDetails, nil
}
