// backend/src/parsers/parser.go
package parsers

import (
	"io"

	"github.com/username/taxfolio/backend/src/models"
)

type Parser interface {
	Parse(file io.Reader) ([]models.CanonicalTransaction, error)
}
