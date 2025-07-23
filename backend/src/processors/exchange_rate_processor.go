package processors

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/patrickmn/go-cache" // Import the cache library
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

// Initialize a new cache for exchange rates.
var rateCache = cache.New(24*time.Hour, 48*time.Hour)

// LoadHistoricalRates is now obsolete and can be removed or left empty.
func LoadHistoricalRates(filePath string) error {
	logger.L.Info("Historical rates are now fetched via API; local file is not used.")
	return nil
}

// GetExchangeRate retrieves the exchange rate for a given currency and date from the ECB API.
// It uses a cache to store results and has a fallback to find the last available rate.
func GetExchangeRate(currency string, date time.Time) (float64, error) {
	if currency == "EUR" {
		return 1.0, nil
	}

	// 1. Check Cache First
	cacheKey := fmt.Sprintf("rate-%s-%s", currency, date.Format("2006-01-02"))
	if rate, found := rateCache.Get(cacheKey); found {
		logger.L.Debug("Exchange rate cache hit", "key", cacheKey)
		return rate.(float64), nil
	}
	logger.L.Debug("Exchange rate cache miss", "key", cacheKey)

	// 2. Fallback Loop: If no rate for today, check yesterday, etc. (up to 7 days)
	for i := 0; i < 7; i++ {
		queryDate := date.AddDate(0, 0, -i)
		dateStr := queryDate.Format("2006-01-02")

		// Construct the API URL
		// Key structure is D.{CURRENCY}.EUR.SP00.A for daily rates vs Euro
		seriesKey := fmt.Sprintf("D.%s.EUR.SP00.A", currency)
		url := fmt.Sprintf(
			"https://data-api.ecb.europa.eu/service/data/EXR/%s?startPeriod=%s&endPeriod=%s&format=jsondata",
			seriesKey,
			dateStr,
			dateStr,
		)

		// Make the HTTP request
		resp, err := http.Get(url)
		if err != nil {
			logger.L.Warn("Failed to make ECB API request", "url", url, "error", err)
			continue // Try the previous day
		}
		defer resp.Body.Close()

		// If we get a 404, it means no data for this day (weekend/holiday), so we continue to the previous day.
		if resp.StatusCode == http.StatusNotFound {
			logger.L.Debug("No exchange rate found for date, trying previous day", "currency", currency, "date", dateStr)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			logger.L.Warn("ECB API returned non-OK status", "status", resp.Status, "url", url)
			continue // Try the previous day
		}

		// Decode the JSON response
		var ecbData models.ECBResponse
		if err := json.NewDecoder(resp.Body).Decode(&ecbData); err != nil {
			logger.L.Warn("Failed to decode ECB API response", "url", url, "error", err)
			continue // Try the previous day
		}

		// Extract the rate
		rate, err := extractRateFromResponse(ecbData)
		if err != nil {
			logger.L.Warn("Could not extract rate from ECB response", "date", dateStr, "error", err)
			continue // Try the previous day
		}

		// 3. Success: Store in cache and return
		logger.L.Info("Successfully fetched exchange rate from ECB API", "currency", currency, "requestedDate", date.Format("2006-01-02"), "foundDate", dateStr, "rate", rate)
		rateCache.Set(cacheKey, rate, cache.DefaultExpiration)
		return rate, nil
	}

	// 4. Failure after all fallbacks
	return 0, fmt.Errorf("exchange rate not found for %s on or before %s", currency, date.Format("2006-01-02"))
}

// extractRateFromResponse safely navigates the complex ECB JSON structure to find the rate.
func extractRateFromResponse(data models.ECBResponse) (float64, error) {
	if len(data.DataSets) == 0 {
		return 0, fmt.Errorf("no dataSets in response")
	}

	seriesMap := data.DataSets[0].Series
	// The series key is "0:0:0:0:0". We iterate to be safe.
	for _, seriesData := range seriesMap {
		if observations, ok := seriesData.Observations["0"]; ok {
			if len(observations) > 0 {
				return observations[0], nil
			}
		}
	}

	return 0, fmt.Errorf("observation value not found in the expected structure")
}

// Note: The old GetExchangeRate logic and the historicalRates variable can be deleted.
