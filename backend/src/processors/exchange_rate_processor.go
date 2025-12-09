// backend/src/processors/exchange_rate_processor.go
package processors

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

// Initialize a new cache for exchange rates.
// We use a longer expiration (24h) since historical rates don't change.
var rateCache = cache.New(24*time.Hour, 48*time.Hour)

// Local struct to parse Yahoo response
type yahooRateResponse struct {
	Chart struct {
		Result []struct {
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Close []float64 `json:"close"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

// LoadHistoricalRates is obsolete.
func LoadHistoricalRates(filePath string) error {
	return nil
}

// GetExchangeRate retrieves the exchange rate using a "Bulk Fetch" strategy.
func GetExchangeRate(currency string, date time.Time) (float64, error) {
	if currency == "EUR" {
		return 1.0, nil
	}

	// Step A: Check if we have bulk-fetched this currency recently
	historyKey := fmt.Sprintf("history-fetched-%s", currency)
	_, historyLoaded := rateCache.Get(historyKey)

	if !historyLoaded {
		logger.L.Info("Exchange Rate: Triggering bulk fetch from Yahoo", "currency", currency)
		err := fetchAndCacheYahooHistory(currency)
		if err != nil {
			logger.L.Warn("Exchange Rate: Yahoo bulk fetch failed, falling back to single-day ECB", "currency", currency, "error", err)
		} else {
			// Mark history as loaded for 24 hours
			rateCache.Set(historyKey, true, 24*time.Hour)
		}
	}

	// Step B: Look up the rate in cache
	for i := 0; i < 7; i++ {
		queryDate := date.AddDate(0, 0, -i)
		cacheKey := fmt.Sprintf("rate-%s-%s", currency, queryDate.Format("2006-01-02"))

		if rate, found := rateCache.Get(cacheKey); found {
			// DEBUG: Log the rate found for verification
			// logger.L.Debug("Exchange Rate: Cache Hit", "currency", currency, "date", queryDate.Format("2006-01-02"), "rate", rate)
			return rate.(float64), nil
		}
	}

	// Step C: Ultimate Fallback (ECB API)
	logger.L.Warn("Exchange Rate: Cache miss after bulk fetch, trying ECB fallback", "currency", currency, "date", date.Format("2006-01-02"))

	rate, err := fetchECBRate(currency, date)
	if err == nil && rate > 0 {
		cacheKey := fmt.Sprintf("rate-%s-%s", currency, date.Format("2006-01-02"))
		rateCache.Set(cacheKey, rate, cache.DefaultExpiration)
		return rate, nil
	}

	return 0, fmt.Errorf("exchange rate not found for %s (Yahoo history and ECB failed)", currency)
}

// fetchAndCacheYahooHistory gets 10y data and populates rateCache
func fetchAndCacheYahooHistory(currency string) error {
	// FIX: Use EUR{CURRENCY}=X (e.g., EURUSD=X)
	// This gives "How much Foreign Currency for 1 EUR", matching the system's logic.
	ticker := fmt.Sprintf("EUR%s=X", currency)

	// Fetch 10 years of daily data
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?symbol=%s&interval=1d&range=10y", ticker, ticker)

	logger.L.Debug("Yahoo Exchange Rate Request", "url", url)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("yahoo status %d", resp.StatusCode)
	}

	var data yahooRateResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	if data.Chart.Error != nil || len(data.Chart.Result) == 0 {
		return fmt.Errorf("yahoo api error or empty result")
	}

	result := data.Chart.Result[0]
	timestamps := result.Timestamp
	quotes := result.Indicators.Quote[0].Close

	if len(timestamps) != len(quotes) {
		return fmt.Errorf("mismatched timestamp and quote lengths")
	}

	// Iterate through all data points and populate cache
	count := 0
	var lastRate float64
	var lastDate string

	for i, ts := range timestamps {
		price := quotes[i]
		if price <= 0 {
			continue // Skip missing data
		}

		// Convert timestamp to YYYY-MM-DD string
		dateStr := time.Unix(ts, 0).Format("2006-01-02")

		// Create cache key: rate-USD-2023-01-01
		key := fmt.Sprintf("rate-%s-%s", currency, dateStr)

		// Store in cache
		rateCache.Set(key, price, cache.DefaultExpiration)
		count++

		// Keep track of last rate for debugging log
		lastRate = price
		lastDate = dateStr
	}

	logger.L.Info("Exchange Rate: Populated cache from Yahoo", "currency", currency, "pair", ticker, "points", count, "lastDate", lastDate, "lastRate", lastRate)
	return nil
}

// fetchECBRate performs the existing logic for querying the ECB (Single Day)
func fetchECBRate(currency string, date time.Time) (float64, error) {
	dateStr := date.Format("2006-01-02")
	seriesKey := fmt.Sprintf("D.%s.EUR.SP00.A", currency)
	url := fmt.Sprintf(
		"https://data-api.ecb.europa.eu/service/data/EXR/%s?startPeriod=%s&endPeriod=%s&format=jsondata",
		seriesKey, dateStr, dateStr,
	)

	logger.L.Debug("ECB Fallback Request", "url", url)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("ecb status %d", resp.StatusCode)
	}

	var ecbData models.ECBResponse
	if err := json.NewDecoder(resp.Body).Decode(&ecbData); err != nil {
		return 0, err
	}

	return extractRateFromResponse(ecbData)
}

// extractRateFromResponse safely navigates the complex ECB JSON structure
func extractRateFromResponse(data models.ECBResponse) (float64, error) {
	if len(data.DataSets) == 0 {
		return 0, fmt.Errorf("no dataSets in response")
	}
	seriesMap := data.DataSets[0].Series
	for _, seriesData := range seriesMap {
		if observations, ok := seriesData.Observations["0"]; ok {
			if len(observations) > 0 {
				return observations[0], nil
			}
		}
	}
	return 0, fmt.Errorf("observation value not found")
}
