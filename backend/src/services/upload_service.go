package services

import (
	"fmt"
	"io"
	"log"
	"strings"

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
	cashMovementProcessor processors.CashMovementProcessor // Added

	// Store the latest result and the transactions that generated it
	latestResult                *UploadResult
	latestRawTransactions       []models.RawTransaction       // Added to store raw transactions
	latestProcessedTransactions []models.ProcessedTransaction // Added to store transactions
}

// NewUploadService creates a new instance of UploadService with its dependencies.
func NewUploadService(
	csvParser parsers.CSVParser,
	transactionProcessor parsers.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
	cashMovementProcessor processors.CashMovementProcessor, // Added
) UploadService {
	return &uploadServiceImpl{
		csvParser:             csvParser,
		transactionProcessor:  transactionProcessor,
		dividendProcessor:     dividendProcessor,
		stockProcessor:        stockProcessor,
		optionProcessor:       optionProcessor,
		cashMovementProcessor: cashMovementProcessor, // Added
	}
}

// ProcessUpload handles the core logic of parsing the file and processing transactions.
func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader, userID int64) (*UploadResult, error) {
	// 1. Parse CSV file
	rawTransactions, err := s.csvParser.Parse(fileReader)
	if err != nil {
		return nil, fmt.Errorf("error parsing csv file: %w", err)
	}

	// 2. Process RawTransaction into ProcessedTransaction
	processedTransactions, err := s.transactionProcessor.Process(rawTransactions)
	if err != nil {
		// Consider if this should be a different error type/status if it happens
		return nil, fmt.Errorf("error processing raw transactions: %w", err)
	}

	// 3. Calculate dividends
	dividendResult := s.dividendProcessor.Calculate(processedTransactions)

	// 4. Process stock transactions
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(processedTransactions)

	// 5. Process option transactions
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(processedTransactions)

	// 6. Process cash movements
	cashMovements := s.cashMovementProcessor.Process(processedTransactions) // Added

	// 7. Aggregate results (renumbered)
	result := &UploadResult{
		DividendResult:    dividendResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements, // Added
	}

	// Store the latest result and transactions with userID before returning
	s.latestResult = result
	s.latestRawTransactions = rawTransactions
	s.latestProcessedTransactions = processedTransactions

	// Store transactions in database with userID
	for _, tx := range processedTransactions {
		_, err := database.DB.Exec(`
			INSERT INTO processed_transactions 
			(user_id, date, product_name, isin, quantity, original_quantity, price, order_type, 
			 transaction_type, description, amount, currency, commission, order_id, 
			 exchange_rate, amount_eur, country_code)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			userID, tx.Date, tx.ProductName, tx.ISIN, tx.Quantity, tx.OriginalQuantity, tx.Price,
			tx.OrderType, tx.TransactionType, tx.Description, tx.Amount, tx.Currency,
			tx.Commission, tx.OrderID, tx.ExchangeRate, tx.AmountEUR, tx.CountryCode)
		if err != nil {
			log.Printf("Error storing transaction in database: %v", err)
			return nil, fmt.Errorf("error storing processed transactions in database: %w", err)
		}
	}

	return result, nil
}

// GetLatestUploadResult returns the most recently processed upload result.
func (s *uploadServiceImpl) GetLatestUploadResult(userID int64) (*UploadResult, error) {
	// Query database for user's latest result
	rows, err := database.DB.Query(`
		SELECT date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date DESC
		LIMIT 100`, userID)
	if err != nil {
		return nil, fmt.Errorf("error querying transactions: %w", err)
	}
	defer rows.Close()

	var transactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		err := rows.Scan(
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if err != nil {
			return nil, fmt.Errorf("error scanning transaction: %w", err)
		}
		transactions = append(transactions, tx)
	}

	// Process transactions to generate result
	dividendResult := s.dividendProcessor.Calculate(transactions)
	stockSaleDetails, stockHoldings := s.stockProcessor.Process(transactions)
	optionSaleDetails, optionHoldings := s.optionProcessor.Process(transactions)
	cashMovements := s.cashMovementProcessor.Process(transactions)

	return &UploadResult{
		DividendResult:    dividendResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
		CashMovements:     cashMovements,
	}, nil
}

// GetDividendTaxSummary calculates and returns the dividend summary specifically for tax reporting.
func (s *uploadServiceImpl) GetDividendTaxSummary() (models.DividendTaxResult, error) {
	if s.latestProcessedTransactions == nil {
		// Return an empty result or an error if no upload has been processed yet
		// Returning an error is likely better here to indicate no data is available.
		return nil, fmt.Errorf("no upload processed yet, cannot generate dividend tax summary")
	}

	// Use the stored transactions to calculate the tax summary
	taxSummary := s.dividendProcessor.CalculateTaxSummary(s.latestProcessedTransactions)

	return taxSummary, nil
}

// GetDividendTransactions retrieves the list of individual dividend transactions from the latest upload.
func (s *uploadServiceImpl) GetDividendTransactions() ([]models.ProcessedTransaction, error) {
	if s.latestProcessedTransactions == nil {
		// Return an error if no upload has been processed yet
		return nil, fmt.Errorf("no upload processed yet, cannot retrieve dividend transactions")
	}

	dividends := []models.ProcessedTransaction{}
	for _, tx := range s.latestProcessedTransactions {
		// Assuming OrderType "dividend" identifies dividend transactions (case-insensitive check is safer)
		if tx.OrderType != "" && strings.ToLower(tx.OrderType) == "dividend" {
			dividends = append(dividends, tx)
		}
	}

	return dividends, nil
}

// GetRawTransactions retrieves the list of raw transactions from the latest upload.
func (s *uploadServiceImpl) GetRawTransactions() ([]models.RawTransaction, error) {
	if s.latestRawTransactions == nil {
		// Return an error if no upload has been processed yet
		return nil, fmt.Errorf("no upload processed yet, cannot retrieve raw transactions")
	}
	return s.latestRawTransactions, nil
}

// GetProcessedTransactions retrieves the list of all processed transactions from the latest upload.
func (s *uploadServiceImpl) GetProcessedTransactions() ([]models.ProcessedTransaction, error) {
	if s.latestProcessedTransactions == nil {
		// Return an error if no upload has been processed yet
		return nil, fmt.Errorf("no upload processed yet, cannot retrieve processed transactions")
	}
	return s.latestProcessedTransactions, nil
}

// GetStockHoldings retrieves the current stock holdings from the latest upload.
func (s *uploadServiceImpl) GetStockHoldings() ([]models.PurchaseLot, error) {
	if s.latestResult == nil {
		return nil, fmt.Errorf("no upload processed yet, cannot retrieve stock holdings")
	}
	return s.latestResult.StockHoldings, nil
}

// GetOptionHoldings retrieves the current option holdings from the latest upload.
func (s *uploadServiceImpl) GetOptionHoldings() ([]models.OptionHolding, error) {
	if s.latestResult == nil {
		return nil, fmt.Errorf("no upload processed yet, cannot retrieve option holdings")
	}
	return s.latestResult.OptionHoldings, nil
}
