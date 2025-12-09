// backend/src/services/price_service.go
package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/processors"
	"golang.org/x/net/publicsuffix"
)

// --- Manual Overrides Configuration ---
// Maps specific ISINs to their correct Yahoo Finance Ticker symbols.
// This bypasses the search API for known problematic cases.
var manualTickerOverrides = map[string]string{
	"PLLVTSF00010": "TXT.WA", // Text S.A. (formerly LiveChat) on Warsaw SE
	"IE000U9J8HX9": "JEPQ.L", // JPMorgan Nasdaq Equity Premium Income Active UCITS ETF
	"IE00BK5BQT80": "VWRA.L",
}

// --- API Response Structs ---

// Struct for the v1 search API to convert ISIN to Ticker
type yahooSearchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		Exchange  string `json:"exchange"`
		Shortname string `json:"shortname"`
		QuoteType string `json:"quoteType"`
		Currency  string `json:"currency"`
	} `json:"quotes"`
}

// Struct for the v8 chart/quote API to get the current price
type yahooChartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency           string  `json:"currency"`
				Symbol             string  `json:"symbol"`
				RegularMarketPrice float64 `json:"regularMarketPrice"`
			} `json:"meta"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

// Struct to parse Yahoo's Historical JSON
type yahooHistoryResponse struct {
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

// --- Service Implementation ---

type priceServiceImpl struct {
	httpClient    http.Client
	isInitialized bool
	mu            sync.Mutex
}

func NewPriceService() PriceService {
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		logger.L.Error("Failed to create cookie jar", "error", err)
	}
	client := http.Client{
		Jar:     jar,
		Timeout: 20 * time.Second,
	}
	s := &priceServiceImpl{
		httpClient:    client,
		isInitialized: false,
	}
	go s.initializeYahooSession()
	return s
}

func (s *priceServiceImpl) initializeYahooSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isInitialized {
		return
	}
	logger.L.Info("Attempting to initialize Yahoo Finance session...")
	initURL := "https://finance.yahoo.com/quote/AAPL"
	req, _ := http.NewRequest("GET", initURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		logger.L.Error("Failed session init request", "error", err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode == http.StatusOK {
		s.isInitialized = true
		logger.L.Info("Yahoo session initialized successfully.")
	} else {
		logger.L.Warn("Failed to initialize Yahoo session", "status", resp.Status)
	}
}

func (s *priceServiceImpl) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	s.mu.Lock()
	if !s.isInitialized {
		s.mu.Unlock()
		s.initializeYahooSession()
	} else {
		s.mu.Unlock()
	}

	results := make(map[string]PriceInfo)
	for _, isin := range isins {
		results[isin] = PriceInfo{Status: "UNAVAILABLE"}
	}
	if len(isins) == 0 {
		return results, nil
	}

	// 1. Get ISIN -> Ticker mappings (from DB cache or API)
	isinToTickerMap, err := s.getIsinToTickerMap(isins)
	if err != nil {
		return results, err
	}

	// 2. Get Ticker -> Price mappings (from DB cache or API for today)
	tickerToPriceMap, err := s.getTickerToPriceMap(isinToTickerMap)
	if err != nil {
		return results, err
	}

	// 3. Combine results and convert to EUR
	for _, isin := range isins {
		ticker, ok := isinToTickerMap[isin]
		if !ok {
			continue
		}
		priceInfo, ok := tickerToPriceMap[ticker]
		if !ok {
			continue
		}

		priceEUR := priceInfo.Price
		if strings.ToUpper(priceInfo.Currency) != "EUR" {
			rate, err := processors.GetExchangeRate(priceInfo.Currency, time.Now())
			if err != nil || rate == 0 {
				logger.L.Warn("Could not get exchange rate to convert price", "currency", priceInfo.Currency, "ticker", ticker, "error", err)
				continue
			}
			priceEUR = priceInfo.Price / rate
		}
		results[isin] = PriceInfo{
			Status:   "OK",
			Price:    priceEUR,
			Currency: "EUR",
		}
	}

	return results, nil
}

func (s *priceServiceImpl) getIsinToTickerMap(isins []string) (map[string]string, error) {
	isinToTickerMap := make(map[string]string)
	dbMappings, err := model.GetMappingsByISINs(database.DB, isins)
	if err != nil {
		logger.L.Error("Failed to get ISIN mappings from DB", "error", err)
	}

	isinsToFetch := []string{}
	for _, isin := range isins {
		if mapping, ok := dbMappings[isin]; ok {
			isinToTickerMap[isin] = mapping.TickerSymbol
		} else {
			isinsToFetch = append(isinsToFetch, isin)
		}
	}

	if len(isinsToFetch) > 0 {
		for _, isin := range isinsToFetch {
			// Small delay to be polite to the API
			time.Sleep(250 * time.Millisecond)

			ticker, exchange, currency, err := s.fetchTickerForISIN(isin)
			if err != nil {
				logger.L.Warn("Could not get ticker for ISIN from API", "isin", isin, "error", err)
				continue
			}
			isinToTickerMap[isin] = ticker
			newMapping := model.ISINTickerMap{
				ISIN:         isin,
				TickerSymbol: ticker,
				Exchange:     sql.NullString{String: exchange, Valid: exchange != ""},
				Currency:     currency,
			}
			model.InsertMapping(database.DB, newMapping)
		}
	}
	return isinToTickerMap, nil
}

func (s *priceServiceImpl) getTickerToPriceMap(isinToTickerMap map[string]string) (map[string]model.DailyPrice, error) {
	tickerToPriceMap := make(map[string]model.DailyPrice)
	uniqueTickers := make(map[string]bool)
	for _, ticker := range isinToTickerMap {
		uniqueTickers[ticker] = true
	}

	var tickerList []string
	for ticker := range uniqueTickers {
		tickerList = append(tickerList, ticker)
	}

	todayStr := time.Now().Format("2006-01-02")
	cachedPrices, err := model.GetPricesByTickersAndDate(database.DB, tickerList, todayStr)
	if err != nil {
		logger.L.Error("Failed to get daily prices from DB", "error", err)
	}

	tickersToFetch := []string{}
	for _, ticker := range tickerList {
		if price, ok := cachedPrices[ticker]; ok {
			tickerToPriceMap[ticker] = price
		} else {
			tickersToFetch = append(tickersToFetch, ticker)
		}
	}

	if len(tickersToFetch) > 0 {
		for _, ticker := range tickersToFetch {
			time.Sleep(250 * time.Millisecond)
			price, currency, err := s.getPriceForTicker(ticker)
			if err != nil {
				logger.L.Warn("Could not get price for ticker from API", "ticker", ticker, "error", err)
				continue
			}
			dailyPrice := model.DailyPrice{
				TickerSymbol: ticker,
				Date:         todayStr,
				Price:        price,
				Currency:     currency,
			}
			tickerToPriceMap[ticker] = dailyPrice
			model.InsertOrUpdatePrice(database.DB, dailyPrice)
		}
	}
	return tickerToPriceMap, nil
}

func (s *priceServiceImpl) fetchTickerForISIN(isin string) (string, string, string, error) {
	if len(isin) != 12 {
		return "", "", "", fmt.Errorf("invalid ISIN length: %s", isin)
	}

	if ticker, ok := manualTickerOverrides[isin]; ok {
		logger.L.Info("Using manual ticker override", "isin", isin, "ticker", ticker)
		return ticker, "Override", "", nil
	}

	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=1&lang=en-US", isin)

	// --- DEBUG LOGGING ---
	logger.L.Debug("Yahoo SEARCH API Request", "url", searchURL)
	// ---------------------

	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to call Yahoo search API for ISIN %s: %w", isin, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to read response body: %w", err)
	}

	// --- DEBUG LOGGING ---
	logger.L.Debug("Yahoo SEARCH API Response", "isin", isin, "status", resp.Status, "body", string(bodyBytes))
	// ---------------------

	if resp.StatusCode != http.StatusOK {
		return "", "", "", fmt.Errorf("yahoo search API returned non-OK status %d", resp.StatusCode)
	}

	var searchData yahooSearchResponse
	if err := json.Unmarshal(bodyBytes, &searchData); err != nil {
		return "", "", "", fmt.Errorf("failed to decode Yahoo search response: %w", err)
	}

	if len(searchData.Quotes) == 0 || searchData.Quotes[0].Symbol == "" {
		return "", "", "", fmt.Errorf("no ticker symbol found for ISIN %s", isin)
	}
	quote := searchData.Quotes[0]
	return quote.Symbol, quote.Exchange, quote.Currency, nil
}

func (s *priceServiceImpl) getPriceForTicker(ticker string) (float64, string, error) {
	quoteURL := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s", ticker)

	// --- DEBUG LOGGING ---
	logger.L.Debug("Yahoo CURRENT PRICE Request", "url", quoteURL)
	// ---------------------

	req, err := http.NewRequest("GET", quoteURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("failed to call Yahoo chart API for ticker %s: %w", ticker, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, "", fmt.Errorf("failed to read response body: %w", err)
	}

	// --- DEBUG LOGGING ---
	logger.L.Debug("Yahoo CURRENT PRICE Response", "ticker", ticker, "status", resp.Status, "bodyLength", len(bodyBytes))
	// ---------------------

	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("yahoo chart API returned non-OK status %d", resp.StatusCode)
	}

	var chartData yahooChartResponse
	if err := json.Unmarshal(bodyBytes, &chartData); err != nil {
		return 0, "", fmt.Errorf("failed to decode Yahoo chart response: %w", err)
	}

	if chartData.Chart.Error != nil {
		return 0, "", fmt.Errorf("yahoo chart API returned an error: %v", chartData.Chart.Error)
	}

	if len(chartData.Chart.Result) == 0 || chartData.Chart.Result[0].Meta.RegularMarketPrice == 0 {
		return 0, "", fmt.Errorf("no price data found for ticker %s", ticker)
	}

	meta := chartData.Chart.Result[0].Meta
	return meta.RegularMarketPrice, meta.Currency, nil
}

// GetHistoricalPrices fetches full daily history for a ticker (10 years).
func (s *priceServiceImpl) GetHistoricalPrices(ticker string) (PriceMap, error) {
	s.mu.Lock()
	if !s.isInitialized {
		s.mu.Unlock()
		s.initializeYahooSession()
	} else {
		s.mu.Unlock()
	}

	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=10y", ticker)

	// --- DEBUG LOGGING ---
	logger.L.Debug("Yahoo HISTORY Request", "url", url)
	// ---------------------

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch history for %s: %w", ticker, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// --- DEBUG LOGGING ---
	// Logging historical data can be HUGE, so we log size and maybe a snippet or just status
	logger.L.Debug("Yahoo HISTORY Response", "ticker", ticker, "status", resp.Status, "bodySize", len(bodyBytes))
	// ---------------------

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("yahoo history api returned %d for %s", resp.StatusCode, ticker)
	}

	var data yahooHistoryResponse
	if err := json.Unmarshal(bodyBytes, &data); err != nil {
		return nil, fmt.Errorf("failed to decode history json: %w", err)
	}

	if len(data.Chart.Result) == 0 {
		return nil, fmt.Errorf("no history result found in json for %s", ticker)
	}

	result := data.Chart.Result[0]
	timestamps := result.Timestamp
	if len(result.Indicators.Quote) == 0 {
		return nil, fmt.Errorf("no quote data found for %s", ticker)
	}
	quotes := result.Indicators.Quote[0].Close

	if len(timestamps) != len(quotes) {
		return nil, fmt.Errorf("data mismatch: %d timestamps vs %d quotes", len(timestamps), len(quotes))
	}

	priceMap := make(PriceMap)
	var sortedDates []string

	for i, ts := range timestamps {
		price := quotes[i]
		if price == 0 {
			continue
		}
		dateStr := time.Unix(ts, 0).Format("2006-01-02")
		priceMap[dateStr] = price
		sortedDates = append(sortedDates, dateStr)
	}

	if len(sortedDates) > 0 {
		sort.Strings(sortedDates)
		startDate, _ := time.Parse("2006-01-02", sortedDates[0])
		endDate := time.Now()
		lastPrice := priceMap[sortedDates[0]]

		for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
			dateKey := d.Format("2006-01-02")
			if val, ok := priceMap[dateKey]; ok {
				lastPrice = val
			} else {
				priceMap[dateKey] = lastPrice
			}
		}
	}

	return priceMap, nil
}

// Call this in your main.go or a background job.
func (s *priceServiceImpl) EnsureBenchmarkData() error {
	benchmarkTicker := "SPY"

	// 1. Optimization: Check if we already have recent data to avoid fetching every time
	// We check if we have data for yesterday or today
	var count int
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	err := database.DB.QueryRow("SELECT COUNT(*) FROM daily_prices WHERE ticker_symbol = ? AND date >= ?", benchmarkTicker, yesterday).Scan(&count)
	if err == nil && count > 0 {
		logger.L.Info("Benchmark data (SPY) is up to date", "ticker", benchmarkTicker)
		return nil
	}

	logger.L.Info("Fetching Benchmark Data (SPY) from Yahoo", "ticker", benchmarkTicker)

	// 2. Fetch from Yahoo
	prices, err := s.GetHistoricalPrices(benchmarkTicker)
	if err != nil {
		return fmt.Errorf("failed to fetch benchmark history: %w", err)
	}

	if len(prices) == 0 {
		return fmt.Errorf("no benchmark prices returned from API")
	}

	// 3. Save to DB using a TRANSACTION (Batch Insert)
	// This is the critical fix for "database locked" errors
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for benchmark save: %w", err)
	}
	// Ensure rollback in case of panic or error
	defer tx.Rollback()

	// Prepare the statement once
	stmt, err := tx.Prepare(`
		INSERT INTO daily_prices (ticker_symbol, date, price, currency, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(ticker_symbol, date) DO UPDATE SET
			price = excluded.price,
			updated_at = excluded.updated_at;
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare benchmark insert statement: %w", err)
	}
	defer stmt.Close()

	rowsProcessed := 0
	for date, price := range prices {
		_, err := stmt.Exec(benchmarkTicker, date, price, "USD", time.Now())
		if err != nil {
			logger.L.Warn("Failed to save benchmark price row", "date", date, "error", err)
			continue
		}
		rowsProcessed++
	}

	// Commit the transaction to save all rows at once
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit benchmark transaction: %w", err)
	}

	logger.L.Info("Benchmark Data (SPY) saved to DB successfully", "rows_processed", rowsProcessed)
	return nil
}
