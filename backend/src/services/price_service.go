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

// Structs for Yahoo Finance API responses (remain the same)
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

type priceServiceImpl struct {
	httpClient http.Client
	crumb      string
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
		httpClient: client,
	}

	if err := s.initializeYahooSession(); err != nil {
		logger.L.Error("Failed to initialize Yahoo Finance session. Price fetching may fail.", "error", err)
	}

	return s
}

func (s *priceServiceImpl) initializeYahooSession() error {
	logger.L.Info("Initializing Yahoo Finance session to get crumb and cookies...")

	// --- Step 1: Visit homepage to get initial cookies ---
	cookieURL := "https://finance.yahoo.com"
	req, err := http.NewRequest("GET", cookieURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create initial cookie request: %w", err)
	}
	// Add more browser-like headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	logger.L.Debug("Attempting to get session cookies from homepage", "url", cookieURL)
	cookieResp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make initial cookie request to Yahoo: %w", err)
	}
	defer cookieResp.Body.Close()

	if cookieResp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(cookieResp.Body)
		logger.L.Error("Yahoo cookie request failed", "status", cookieResp.Status, "responseBody", string(bodyBytes))
		return fmt.Errorf("yahoo returned non-OK status for cookie request: %s", cookieResp.Status)
	}
	logger.L.Debug("Successfully obtained initial session cookies from homepage.")

	// --- MODIFICATION: Step 2: Simulate accepting the cookie consent ---
	consentURL := "https://consent.yahoo.com/v2/collectConsent"
	consentReq, err := http.NewRequest("POST", consentURL, nil) // A POST with no body is often sufficient
	if err != nil {
		return fmt.Errorf("failed to create consent request: %w", err)
	}
	// Copy headers and the cookies we just got will be sent automatically by the client
	consentReq.Header.Set("User-Agent", req.Header.Get("User-Agent"))

	logger.L.Debug("Attempting to post cookie consent", "url", consentURL)
	consentResp, err := s.httpClient.Do(consentReq)
	if err != nil {
		return fmt.Errorf("failed to make consent request to Yahoo: %w", err)
	}
	defer consentResp.Body.Close()

	if consentResp.StatusCode != http.StatusOK && consentResp.StatusCode != http.StatusNoContent {
		bodyBytes, _ := io.ReadAll(consentResp.Body)
		logger.L.Error("Yahoo consent request failed", "status", consentResp.Status, "responseBody", string(bodyBytes))
		return fmt.Errorf("yahoo returned non-OK status for consent request: %s", consentResp.Status)
	}
	logger.L.Debug("Successfully posted cookie consent. Cookies should now be valid.")

	// --- Step 3: Now get the crumb with the validated cookies ---
	crumbURL := "https://query1.finance.yahoo.com/v1/test/getcrumb"
	reqCrumb, err := http.NewRequest("GET", crumbURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create crumb request: %w", err)
	}
	reqCrumb.Header.Set("User-Agent", req.Header.Get("User-Agent"))

	logger.L.Debug("Attempting to get crumb", "url", crumbURL)
	crumbResp, err := s.httpClient.Do(reqCrumb)
	if err != nil {
		return fmt.Errorf("failed to make crumb request to Yahoo: %w", err)
	}
	defer crumbResp.Body.Close()

	if crumbResp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(crumbResp.Body)
		logger.L.Error("Yahoo crumb request failed", "status", crumbResp.Status, "responseBody", string(bodyBytes))
		return fmt.Errorf("yahoo crumb endpoint returned non-OK status: %s", crumbResp.Status)
	}

	body, err := io.ReadAll(crumbResp.Body)
	if err != nil {
		return fmt.Errorf("failed to read Yahoo crumb response body: %w", err)
	}

	crumb := string(body)
	if len(crumb) < 5 || len(crumb) > 30 {
		return fmt.Errorf("received an invalid crumb from Yahoo: '%s'", crumb)
	}

	s.crumb = crumb
	logger.L.Info("Successfully obtained Yahoo Finance crumb.")
	return nil
}

// GetCurrentPrices remains the same
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

	yahooPrices, err := s.fetchPricesFromYahoo(uniqueISINs)
	if err != nil {
		logger.L.Error("An error occurred during the Yahoo Finance fetch process", "error", err)
	}

	for isin, priceInfo := range yahooPrices {
		if priceInfo.Status == "OK" {
			result[isin] = priceInfo
		}
	}

	return result, nil
}

// fetchPricesFromYahoo remains the same
func (s *priceServiceImpl) fetchPricesFromYahoo(isins []string) (map[string]PriceInfo, error) {
	yahooResults := make(map[string]PriceInfo)
	for _, isin := range isins {
		time.Sleep(250 * time.Millisecond)

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

// getTickerForISIN remains the same
func (s *priceServiceImpl) getTickerForISIN(isin string) (string, error) {
	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s", isin)
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

// getPriceForTicker remains the same
func (s *priceServiceImpl) getPriceForTicker(ticker string) (float64, string, error) {
	quoteURL := fmt.Sprintf("https://query2.finance.yahoo.com/v7/finance/quote?symbols=%s&crumb=%s", ticker, s.crumb)
	req, err := http.NewRequest("GET", quoteURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("failed to call Yahoo quote API for ticker %s: %w", ticker, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.L.Error("Yahoo quote API returned non-OK status", "status", resp.Status, "ticker", ticker, "responseBody", string(bodyBytes))
		return 0, "", fmt.Errorf("yahoo quote API returned non-OK status %d for ticker %s", resp.StatusCode, ticker)
	}

	var quoteData yahooQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quoteData); err != nil {
		return 0, "", fmt.Errorf("failed to decode Yahoo quote response for ticker %s: %w", ticker, err)
	}

	if quoteData.QuoteResponse.Error != nil {
		errorJSON, _ := json.Marshal(quoteData.QuoteResponse.Error)
		logger.L.Error("Yahoo quote API returned an error in its response", "ticker", ticker, "error", string(errorJSON))
		return 0, "", fmt.Errorf("yahoo quote API returned an error for ticker %s: %s", ticker, string(errorJSON))
	}

	if len(quoteData.QuoteResponse.Result) == 0 {
		return 0, "", fmt.Errorf("yahoo quote API returned no result for ticker %s", ticker)
	}

	price := quoteData.QuoteResponse.Result[0].RegularMarketPrice
	currency := quoteData.QuoteResponse.Result[0].Currency
	return price, currency, nil
}
