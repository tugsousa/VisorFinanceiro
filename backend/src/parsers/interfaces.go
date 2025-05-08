package parsers // Correct package declaration for this directory

import (
	"io"

	"github.com/username/taxfolio/backend/src/models"
)

// CSVParser defines the interface for parsing CSV files.
// This interface is used by csv_parser.go
type CSVParser interface {
	Parse(file io.Reader) ([]models.RawTransaction, error)
}

// TransactionProcessor defines the interface for processing raw transactions.
// This interface is used by raw_transaction_parser.go
type TransactionProcessor interface {
	Process(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error)
}
