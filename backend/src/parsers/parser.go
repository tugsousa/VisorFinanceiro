// backend/src/parsers/parser.go
package parsers

import (
	"io"

	"github.com/username/taxfolio/backend/src/models"
)

type Parser interface {
	Parse(file io.Reader) ([]models.CanonicalTransaction, error)
}

// SkippedRowsReporter is implemented by parsers that can tell which rows of a file they left out.
type SkippedRowsReporter interface {
	SkippedRows() []string
}
