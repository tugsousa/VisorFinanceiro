package services

import (
	"TAXFOLIO/src/parsers"
	"TAXFOLIO/src/processors"
	"fmt"
	"io"
)

// uploadServiceImpl implements the UploadService interface.
type uploadServiceImpl struct {
	csvParser            parsers.CSVParser
	transactionProcessor parsers.TransactionProcessor
	dividendProcessor    processors.DividendProcessor
	stockProcessor       processors.StockProcessor
	optionProcessor      processors.OptionProcessor
}

// NewUploadService creates a new instance of UploadService with its dependencies.
func NewUploadService(
	csvParser parsers.CSVParser,
	transactionProcessor parsers.TransactionProcessor,
	dividendProcessor processors.DividendProcessor,
	stockProcessor processors.StockProcessor,
	optionProcessor processors.OptionProcessor,
) UploadService {
	return &uploadServiceImpl{
		csvParser:            csvParser,
		transactionProcessor: transactionProcessor,
		dividendProcessor:    dividendProcessor,
		stockProcessor:       stockProcessor,
		optionProcessor:      optionProcessor,
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

	// 6. Aggregate results
	result := &UploadResult{
		DividendResult:    dividendResult,
		StockSaleDetails:  stockSaleDetails,
		StockHoldings:     stockHoldings,
		OptionSaleDetails: optionSaleDetails,
		OptionHoldings:    optionHoldings,
	}

	return result, nil
}
