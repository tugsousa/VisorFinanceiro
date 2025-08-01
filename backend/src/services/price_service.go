// backend/src/services/price_service.go
package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/processors"
	"golang.org/x/net/publicsuffix"
)

// ... (struct definitions for yahooSearchResponse and yahooChartResponse remain the same)
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

// ... (fetchTickerForISIN and getPriceForTicker functions remain the same as in the previous response)
// fetchTickerForISIN calls Yahoo and returns ticker, exchange, and currency.
func (s *priceServiceImpl) fetchTickerForISIN(isin string) (string, string, string, error) {
	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=1&lang=en-US", isin)
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

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logger.L.Error("Yahoo search API returned non-OK status", "status", resp.Status, "isin", isin, "responseBody", string(bodyBytes))
		return "", "", "", fmt.Errorf("yahoo search API returned non-OK status %d for ISIN %s", resp.StatusCode, isin)
	}

	var searchData yahooSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchData); err != nil {
		return "", "", "", fmt.Errorf("failed to decode Yahoo search response for ISIN %s: %w", isin, err)
	}

	if len(searchData.Quotes) == 0 || searchData.Quotes[0].Symbol == "" {
		return "", "", "", fmt.Errorf("no ticker symbol found for ISIN %s on Yahoo Finance", isin)
	}
	quote := searchData.Quotes[0]
	return quote.Symbol, quote.Exchange, quote.Currency, nil
}

// getPriceForTicker remains largely the same
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
