// backend/src/parsers/factory.go
package parsers

import (
	"fmt"

	"github.com/username/taxfolio/backend/src/parsers/degiro"
	"github.com/username/taxfolio/backend/src/parsers/ibkr"
)

func GetParser(source string) (Parser, error) {
	switch source {
	case "degiro":
		return degiro.NewParser(), nil
	case "ibkr": // <-- ADD THIS CASE
		return ibkr.NewParser(), nil
	default:
		return nil, fmt.Errorf("no parser available for source: %s", source)
	}
}
