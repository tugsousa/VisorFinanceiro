package services

import (
	"TAXFOLIO/src/models"
	"TAXFOLIO/src/parsers"
	"TAXFOLIO/src/processors"
	"fmt"
	"io"
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
func (s *uploadServiceImpl) ProcessUpload(fileReader io.Reader) (*UploadResult, error) {
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

	// Store the latest result and transactions before returning
	s.latestResult = result
	s.latestProcessedTransactions = processedTransactions // Store the transactions

	return result, nil
}

// GetLatestUploadResult returns the most recently processed upload result.
func (s *uploadServiceImpl) GetLatestUploadResult() (*UploadResult, error) {
	if s.latestResult == nil {
		// Return an empty result or an error if no upload has been processed yet
		// For simplicity, returning an empty result for now.
		// Consider returning an error like fmt.Errorf("no upload processed yet")
		return &UploadResult{}, nil
	}
	return s.latestResult, nil
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
