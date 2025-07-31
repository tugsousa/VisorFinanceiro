// backend/src/services/price_service.go
package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"regexp"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/processors"
	"golang.org/x/net/publicsuffix"
)

// Structs for Yahoo Finance API responses
type yahooSearchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		Exchange  string `json:"exchange"`
		Shortname string `json:"shortname"`
		QuoteType string `json:"quoteType"`
	} `json:"quotes"`
}

type yahooQuoteResponse struct {
	QuoteResponse struct {
		Result []struct {
			Symbol             string  `json:"symbol"`
			RegularMarketPrice float64 `json:"regularMarketPrice"`
			Currency           string  `json:"currency"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"quoteResponse"`
}

// priceServiceImpl implements the PriceService interface.
// It now includes a cookie jar and a crumb for authenticated Yahoo requests.
type priceServiceImpl struct {
	httpClient http.Client
	crumb      string // Yahoo's crumb for authentication
}

// NewPriceService creates a new instance of the price service.
// It initializes the HTTP client with a cookie jar and fetches the Yahoo crumb.
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
		httpClient: client,
	}

	// Initialize the service by getting the crumb
	if err := s.initializeYahooSession(); err != nil {
		logger.L.Error("Failed to initialize Yahoo Finance session. Price fetching may fail.", "error", err)
	}

	return s
}

// initializeYahooSession visits a Yahoo Finance page to get necessary cookies and the crumb.
func (s *priceServiceImpl) initializeYahooSession() error {
	logger.L.Info("Initializing Yahoo Finance session to get crumb and cookies...")
	// We use a less common ticker to avoid heavily cached pages.
	initURL := "https://finance.yahoo.com/quote/VHYL.L"
	req, err := http.NewRequest("GET", initURL, nil)
	if err != nil {
		return err
	}
	// A valid User-Agent is crucial.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make initial request to Yahoo: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read Yahoo response body: %w", err)
	}

	// Use regex to find the crumb in the HTML/JS response.
	re := regexp.MustCompile(`"CrumbStore":{"crumb":"(.*?)"}`)
	matches := re.FindStringSubmatch(string(body))

	if len(matches) < 2 {
		return fmt.Errorf("could not find crumb in Yahoo Finance response. The page structure may have changed")
	}

	s.crumb = matches[1]
	logger.L.Info("Successfully obtained Yahoo Finance crumb.")
	return nil
}

// GetCurrentPrices is the main function that now exclusively uses Yahoo Finance.
func (s *priceServiceImpl) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	result := make(map[string]PriceInfo)
	isinsToProcess := make(map[string]bool)
	for _, isin := range isins {
		result[isin] = PriceInfo{Status: "UNAVAILABLE"}
		if isin != "" {
			isinsToProcess[isin] = true
		}
	}
	if len(isinsToProcess) == 0 {
		return result, nil
	}

	// If the crumb is missing, try to re-initialize the session.
	if s.crumb == "" {
		logger.L.Warn("Yahoo crumb is missing, attempting to re-initialize session.")
		if err := s.initializeYahooSession(); err != nil {
			return result, fmt.Errorf("failed to re-initialize Yahoo session: %w", err)
		}
	}

	uniqueISINs := make([]string, 0, len(isinsToProcess))
	for isin := range isinsToProcess {
		uniqueISINs = append(uniqueISINs, isin)
	}

	// Fetch all prices from Yahoo
	yahooPrices, err := s.fetchPricesFromYahoo(uniqueISINs)
	if err != nil {
		logger.L.Error("An error occurred during the Yahoo Finance fetch process", "error", err)
	}

	// Populate the final result map
	for isin, priceInfo := range yahooPrices {
		if priceInfo.Status == "OK" {
			result[isin] = priceInfo
		}
	}

	return result, nil
}

// fetchPricesFromYahoo orchestrates the scraping process for a list of ISINs.
func (s *priceServiceImpl) fetchPricesFromYahoo(isins []string) (map[string]PriceInfo, error) {
	yahooResults := make(map[string]PriceInfo)
	for _, isin := range isins {
		time.Sleep(250 * time.Millisecond) // Respectful delay

		ticker, err := s.getTickerForISIN(isin)
		if err != nil {
			logger.L.Warn("Yahoo Fetch: Could not get ticker", "isin", isin, "error", err)
			continue
		}

		price, currency, err := s.getPriceForTicker(ticker)
		if err != nil {
			logger.L.Warn("Yahoo Fetch: Could not get price", "ticker", ticker, "error", err)
			continue
		}

		priceEUR := price
		if strings.ToUpper(currency) != "EUR" {
			rate, err := processors.GetExchangeRate(currency, time.Now())
			if err != nil || rate == 0 {
				logger.L.Warn("Yahoo Fetch: Could not get exchange rate", "currency", currency, "error", err)
				continue
			}
			priceEUR = price / rate
		}

		logger.L.Info("Yahoo Fetch: Successfully got price", "isin", isin, "ticker", ticker, "priceEUR", priceEUR)
		yahooResults[isin] = PriceInfo{
			Status:   "OK",
			Price:    priceEUR,
			Currency: "EUR",
		}
	}
	return yahooResults, nil
}

// getTickerForISIN uses Yahoo's search to find a ticker for an ISIN.
func (s *priceServiceImpl) getTickerForISIN(isin string) (string, error) {
	// This endpoint seems to work without the crumb for now, but we keep the auth'd client.
	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s", isin)
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Yahoo search API for ISIN %s: %w", isin, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("yahoo search API returned non-OK status %d for ISIN %s", resp.StatusCode, isin)
	}

	var searchData yahooSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchData); err != nil {
		return "", fmt.Errorf("failed to decode Yahoo search response for ISIN %s: %w", isin, err)
	}

	if len(searchData.Quotes) == 0 {
		return "", fmt.Errorf("no ticker found for ISIN %s on Yahoo Finance", isin)
	}

	return searchData.Quotes[0].Symbol, nil
}

// getPriceForTicker uses Yahoo's quote endpoint to get the price for a ticker.
// THIS IS THE MODIFIED FUNCTION that uses the crumb.
func (s *priceServiceImpl) getPriceForTicker(ticker string) (float64, string, error) {
	// This v7 endpoint requires the crumb.
	quoteURL := fmt.Sprintf("https://query2.finance.yahoo.com/v7/finance/quote?symbols=%s&crumb=%s", ticker, s.crumb)
	req, err := http.NewRequest("GET", quoteURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("failed to call Yahoo quote API for ticker %s: %w", ticker, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body) // Read body for context
		return 0, "", fmt.Errorf("yahoo quote API returned non-OK status %d for ticker %s. Body: %s", resp.StatusCode, ticker, string(bodyBytes))
	}

	var quoteData yahooQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quoteData); err != nil {
		return 0, "", fmt.Errorf("failed to decode Yahoo quote response for ticker %s: %w", ticker, err)
	}

	if quoteData.QuoteResponse.Error != nil || len(quoteData.QuoteResponse.Result) == 0 {
		return 0, "", fmt.Errorf("yahoo quote API returned an error or no result for ticker %s", ticker)
	}

	price := quoteData.QuoteResponse.Result[0].RegularMarketPrice
	currency := quoteData.QuoteResponse.Result[0].Currency
	return price, currency, nil
}
