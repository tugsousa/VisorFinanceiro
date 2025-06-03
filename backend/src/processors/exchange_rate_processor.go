package processors

import (
	"encoding/json"
	"fmt"
	"os"
	"sort" // Import the sort package
	"strconv"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

var historicalRates models.ExchangeRate
var ratesLoaded bool = false

// LoadHistoricalRates loads rates from the specified file path.
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

	// Sort the observations: Primary by Currency, Secondary by Date (ascending)
	sort.SliceStable(historicalRates.Root.Obs, func(i, j int) bool {
		if historicalRates.Root.Obs[i].Ccy != historicalRates.Root.Obs[j].Ccy {
			return historicalRates.Root.Obs[i].Ccy < historicalRates.Root.Obs[j].Ccy
		}
		// Assuming _TIME_PERIOD is "YYYY-MM-DD" format for correct string comparison
		// For more robust date sorting, parse to time.Time, but string sort works for YYYY-MM-DD
		return historicalRates.Root.Obs[i].TimePeriod < historicalRates.Root.Obs[j].TimePeriod
	})

	ratesLoaded = true
	logger.L.Info("Historical exchange rates loaded and sorted successfully.", "path", filePath, "observationCount", len(historicalRates.Root.Obs))
	return nil
}

// GetExchangeRate retrieves the exchange rate for a given currency and date.
// If an exact date match is not found, it uses the most recent rate on or before the requested date.
func GetExchangeRate(currency string, date time.Time) (float64, error) {
	if !ratesLoaded {
		logger.L.Error("Attempted to GetExchangeRate before rates were loaded.")
		return 0, fmt.Errorf("historical exchange rates not loaded")
	}

	if currency == "EUR" {
		return 1.0, nil
	}

	targetDateStr := date.Format("2006-01-02") // For logging and comparison if needed
	var bestMatchRateStr string
	var bestMatchDate time.Time // Keep track of the date of the best rate found

	for _, rateObs := range historicalRates.Root.Obs {
		// Since the list is sorted by Ccy, we can optimize by skipping irrelevant currencies
		if rateObs.Ccy < currency {
			continue
		}
		if rateObs.Ccy > currency {
			break // We've passed all rates for the target currency
		}

		// Now, rateObs.Ccy == currency
		obsDate, err := time.Parse("2006-01-02", rateObs.TimePeriod) // Assuming _TIME_PERIOD is "YYYY-MM-DD"
		if err != nil {
			logger.L.Warn("Invalid date format in historical rate data, skipping observation.",
				"currency", currency, "obsDateStr", rateObs.TimePeriod, "error", err)
			continue
		}

		// We are looking for a rate on or before the target date.
		// If obsDate > date, it's too late. Since rates are sorted by date ascending for this currency,
		// all subsequent rates will also be too late.
		if obsDate.After(date) {
			break
		}

		// obsDate is <= date. This is a candidate.
		// Since the data is sorted by date, the current obsDate is the latest one encountered so far
		// that is less than or equal to the target date.
		bestMatchRateStr = rateObs.ObsValue
		bestMatchDate = obsDate // Update the date of the rate we found
	}

	if bestMatchRateStr != "" {
		exchangeRate, err := strconv.ParseFloat(bestMatchRateStr, 64)
		if err != nil {
			logger.L.Error("Invalid exchange rate value string in data",
				"currency", currency, "foundDate", bestMatchDate.Format("2006-01-02"),
				"value", bestMatchRateStr, "error", err)
			return 0, fmt.Errorf("invalid exchange rate value '%s' for %s on/before %s (found for %s): %w",
				bestMatchRateStr, currency, targetDateStr, bestMatchDate.Format("2006-01-02"), err)
		}
		logMsg := "Exchange rate found"
		if bestMatchDate.Format("2006-01-02") == targetDateStr {
			logMsg += " (exact match)"
		} else {
			logMsg += " (last available prior date)"
		}
		logger.L.Debug(logMsg,
			"currency", currency, "requestedDate", targetDateStr,
			"foundRateDate", bestMatchDate.Format("2006-01-02"), "rate", exchangeRate)
		return exchangeRate, nil
	}

	logger.L.Warn("Exchange rate not found on or before the specified date",
		"currency", currency, "date", targetDateStr)
	return 0, fmt.Errorf("exchange rate not found for %s on or before %s", currency, targetDateStr)
}
