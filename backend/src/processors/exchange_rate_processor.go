package processors

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/username/taxfolio/backend/src/logger" // Use new logger
	"github.com/username/taxfolio/backend/src/models"
)

var historicalRates models.ExchangeRate
var ratesLoaded bool = false

// LoadHistoricalRates loads rates from the specified file path.
// This should be called once from main.go after config is loaded.
func LoadHistoricalRates(filePath string) error {
	logger.L.Info("Loading historical exchange rates", "path", filePath)
	file, err := os.ReadFile(filePath)
	if err != nil {
		logger.L.Error("Error reading historical exchange rate file", "path", filePath, "error", err)
		return fmt.Errorf("error reading historical exchange rate file '%s': %w", filePath, err)
	}

	err = json.Unmarshal(file, &historicalRates)
	if err != nil {
		logger.L.Error("Error unmarshalling historical exchange rates", "path", filePath, "error", err)
		return fmt.Errorf("error unmarshalling historical exchange rates from '%s': %w", filePath, err)
	}
	ratesLoaded = true
	logger.L.Info("Historical exchange rates loaded successfully.", "path", filePath, "observationCount", len(historicalRates.Root.Obs))
	return nil
}

// GetExchangeRate retrieves the exchange rate for a given currency and date.
func GetExchangeRate(currency string, date time.Time) (float64, error) {
	if !ratesLoaded {
		// This is a fallback, ideally LoadHistoricalRates is called at startup.
		logger.L.Error("Attempted to GetExchangeRate before rates were loaded.")
		return 0, fmt.Errorf("historical exchange rates not loaded")
	}

	if currency == "EUR" {
		return 1.0, nil
	}

	dateStr := date.Format("2006-01-02")

	for _, rate := range historicalRates.Root.Obs {
		if rate.TimePeriod == dateStr && rate.Ccy == currency {
			exchangeRate, err := strconv.ParseFloat(rate.ObsValue, 64)
			if err != nil {
				logger.L.Warn("Invalid exchange rate value in data", "currency", currency, "date", dateStr, "value", rate.ObsValue, "error", err)
				return 0, fmt.Errorf("invalid exchange rate value for %s on %s: %w", currency, dateStr, err)
			}
			return exchangeRate, nil
		}
	}
	logger.L.Warn("Exchange rate not found", "currency", currency, "date", dateStr)
	return 0, fmt.Errorf("exchange rate not found for %s on %s", currency, dateStr)
}
