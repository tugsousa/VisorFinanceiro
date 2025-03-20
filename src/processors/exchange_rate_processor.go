package processors

import (
	"TAXFOLIO/models"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"
)

var historicalRates models.ExchangeRate

// init loads the historical exchange rates from the JSON file.
func init() {
	// Load historical exchange rates from JSON file
	file, err := os.ReadFile("historicalExchangeRate.json")
	if err != nil {
		fmt.Println("Error reading historical exchange rate file:", err)
		return
	}

	err = json.Unmarshal(file, &historicalRates)
	if err != nil {
		fmt.Println("Error unmarshalling historical exchange rates:", err)
		return
	}
}

// GetExchangeRate retrieves the exchange rate for a given currency and date.
func GetExchangeRate(currency string, date time.Time) (float64, error) {
	// If the currency is EUR, return 1.0
	if currency == "EUR" {
		return 1.0, nil
	}

	// Format the date as a string
	dateStr := date.Format("2006-01-02")

	// Search for the exchange rate in the historical data
	for _, rate := range historicalRates.Root.Obs {
		if rate.TimePeriod == dateStr && rate.Ccy == currency {
			exchangeRate, err := strconv.ParseFloat(rate.ObsValue, 64)
			if err != nil {
				return 0, fmt.Errorf("invalid exchange rate value for %s on %s: %w", currency, dateStr, err)
			}
			return exchangeRate, nil
		}
	}

	// If no exchange rate is found, return an error
	return 0, fmt.Errorf("exchange rate not found for %s on %s", currency, dateStr)
}
