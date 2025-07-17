// backend/src/parsers/factory.go
package parsers

import (
	"fmt"

	"github.com/username/taxfolio/backend/src/parsers/degiro"
)

func GetParser(source string) (Parser, error) {
	switch source {
	case "degiro":
		return degiro.NewParser(), nil
	default:
		return nil, fmt.Errorf("no parser available for source: %s", source)
	}
}
