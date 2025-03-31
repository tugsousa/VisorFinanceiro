package parsers

import (
	"TAXFOLIO/src/models"
	"io"
)

// CSVParser defines the interface for parsing CSV data into raw transactions.
type CSVParser interface {
	Parse(reader io.Reader) ([]models.RawTransaction, error)
}

// TransactionProcessor defines the interface for processing raw transactions into processed transactions.
type TransactionProcessor interface {
	Process(raw []models.RawTransaction) ([]models.ProcessedTransaction, error)
}
