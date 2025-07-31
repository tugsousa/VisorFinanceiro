// backend/src/services/price_service.go
package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/processors"
	"golang.org/x/net/publicsuffix"
)

// Struct for the v1 search API to convert ISIN to Ticker
type yahooSearchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		Exchange  string `json:"exchange"`
		Shortname string `json:"shortname"`
		QuoteType string `json:"quoteType"`
	} `json:"quotes"`
}

// Struct for the v8 chart/quote API to get the price
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

type priceServiceImpl struct {
	httpClient    http.Client
	isInitialized bool
}

func NewPriceService() PriceService {
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		// Log the error but don't fail, as the service might still work
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
	// Best-effort initialization at startup
	s.initializeYahooSession()
	return s
}

// This function "warms up" the session by getting valid cookies from Yahoo.
func (s *priceServiceImpl) initializeYahooSession() error {
	logger.L.Info("Attempting to initialize Yahoo Finance session and get cookies...")

	// Visiting a standard quote page is more likely to yield a valid session
	initURL := "https://finance.yahoo.com/quote/AAPL"
	req, err := http.NewRequest("GET", initURL, nil)
	if err != nil {
		s.isInitialized = false
		return fmt.Errorf("failed to create session init request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.isInitialized = false
		return fmt.Errorf("failed to make session init request to Yahoo: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body) // Ensure the body is read and connection is reusable

	if resp.StatusCode == http.StatusOK {
		s.isInitialized = true
		logger.L.Info("Yahoo session initialized successfully, cookies obtained.")
		return nil
	}

	s.isInitialized = false
	return fmt.Errorf("failed to initialize Yahoo session, status: %s", resp.Status)
}

func (s *priceServiceImpl) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	result := make(map[string]PriceInfo)
	if len(isins) == 0 {
		return result, nil
	}

	// If the initial session setup failed or wasn't run, try it again.
	if !s.isInitialized {
		if err := s.initializeYahooSession(); err != nil {
			logger.L.Error("Failed to re-initialize Yahoo session during GetCurrentPrices", "error", err)
			// We can still proceed and try to fetch prices, it might work.
		}
	}

	yahooPrices, err := s.fetchPricesFromYahoo(isins)
	if err != nil {
		logger.L.Error("An error occurred during the Yahoo Finance fetch process", "error", err)
	}

	// Initialize all ISINs with UNAVAILABLE status
	for _, isin := range isins {
		result[isin] = PriceInfo{Status: "UNAVAILABLE"}
	}
	// Overwrite with any successful results
	for isin, priceInfo := range yahooPrices {
		if priceInfo.Status == "OK" {
			result[isin] = priceInfo
		}
	}

	return result, nil
}

func (s *priceServiceImpl) fetchPricesFromYahoo(isins []string) (map[string]PriceInfo, error) {
	yahooResults := make(map[string]PriceInfo)
	for _, isin := range isins {
		time.Sleep(300 * time.Millisecond)

		// Step 1: Convert ISIN to Ticker
		ticker, err := s.getTickerForISIN(isin)
		if err != nil {
			logger.L.Warn("Yahoo Fetch Step 1 Failed: Could not get ticker", "isin", isin, "error", err)
			continue
		}
		logger.L.Debug("Yahoo Fetch Step 1 OK: Found ticker for ISIN", "isin", isin, "ticker", ticker)

		// Step 2: Get Price for the found Ticker
		price, currency, err := s.getPriceForTicker(ticker)
		if err != nil {
			logger.L.Warn("Yahoo Fetch Step 2 Failed: Could not get price", "ticker", ticker, "error", err)
			continue
		}

		// Step 3: Convert to EUR
		priceEUR := price
		if strings.ToUpper(currency) != "EUR" {
			rate, err := processors.GetExchangeRate(currency, time.Now())
			if err != nil || rate == 0 {
				logger.L.Warn("Yahoo Fetch Step 3 Failed: Could not get exchange rate", "currency", currency, "error", err)
				continue
			}
			priceEUR = price / rate
		}

		logger.L.Info("Yahoo Fetch Success: Got price for ISIN", "isin", isin, "ticker", ticker, "priceEUR", priceEUR)
		yahooResults[isin] = PriceInfo{
			Status:   "OK",
			Price:    priceEUR,
			Currency: "EUR",
		}
	}
	return yahooResults, nil
}

func (s *priceServiceImpl) getTickerForISIN(isin string) (string, error) {
	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=1&lang=en-US", isin)
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Yahoo search API for ISIN %s: %w", isin, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.L.Error("Yahoo search API returned non-OK status", "status", resp.Status, "isin", isin, "responseBody", string(bodyBytes))
		return "", fmt.Errorf("yahoo search API returned non-OK status %d for ISIN %s", resp.StatusCode, isin)
	}

	var searchData yahooSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchData); err != nil {
		return "", fmt.Errorf("failed to decode Yahoo search response for ISIN %s: %w", isin, err)
	}

	if len(searchData.Quotes) == 0 || searchData.Quotes[0].Symbol == "" {
		return "", fmt.Errorf("no ticker symbol found for ISIN %s on Yahoo Finance", isin)
	}

	return searchData.Quotes[0].Symbol, nil
}

func (s *priceServiceImpl) getPriceForTicker(ticker string) (float64, string, error) {
	quoteURL := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s", ticker)
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

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.L.Error("Yahoo chart API returned non-OK status", "status", resp.Status, "ticker", ticker, "responseBody", string(bodyBytes))
		return 0, "", fmt.Errorf("yahoo chart API returned non-OK status %d for ticker %s", resp.StatusCode, ticker)
	}

	var chartData yahooChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&chartData); err != nil {
		return 0, "", fmt.Errorf("failed to decode Yahoo chart response for ticker %s: %w", ticker, err)
	}

	if chartData.Chart.Error != nil {
		errorJSON, _ := json.Marshal(chartData.Chart.Error)
		logger.L.Error("Yahoo chart API returned an error in its response", "ticker", ticker, "error", string(errorJSON))
		return 0, "", fmt.Errorf("yahoo chart API returned an error for ticker %s: %s", ticker, string(errorJSON))
	}

	if len(chartData.Chart.Result) == 0 || chartData.Chart.Result[0].Meta.RegularMarketPrice == 0 {
		return 0, "", fmt.Errorf("no price data found for ticker %s in chart response", ticker)
	}

	meta := chartData.Chart.Result[0].Meta
	price := meta.RegularMarketPrice
	currency := meta.Currency

	if currency == "" {
		return 0, "", fmt.Errorf("currency not found in API response for ticker %s", ticker)
	}

	return price, currency, nil
}
