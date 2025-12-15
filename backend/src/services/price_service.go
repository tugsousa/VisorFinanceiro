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
var manualTickerOverrides = map[string]string{
	"PLLVTSF00010": "TXT.WA", // Text S.A.
	"IE000U9J8HX9": "JEPQ.L", // JPMorgan Nasdaq Equity Premium Income Active UCITS ETF
	"IE00BK5BQT80": "VWRA.L",
}

// --- API Response Structs ---

type yahooSearchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		Exchange  string `json:"exchange"`
		Shortname string `json:"shortname"`
		QuoteType string `json:"quoteType"`
		Currency  string `json:"currency"`
	} `json:"quotes"`
}

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

type yahooHistoryResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency string `json:"currency"`
			} `json:"meta"`
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

type yahooQuoteSummaryResponse struct {
	QuoteSummary struct {
		Result []struct {
			AssetProfile struct {
				Sector   string `json:"sector"`
				Industry string `json:"industry"`
			} `json:"assetProfile"`
			QuoteType struct {
				QuoteType string `json:"quoteType"`
			} `json:"quoteType"`
			FundProfile struct {
				CategoryName string `json:"categoryName"`
			} `json:"fundProfile"`
			SummaryProfile struct {
				Sector   string `json:"sector"`
				Industry string `json:"industry"`
			} `json:"summaryProfile"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"quoteSummary"`
}

// Estrutura para eventos (dividendos)
type yahooEventsResponse struct {
	Chart struct {
		Result []struct {
			Events struct {
				Dividends map[string]struct {
					Amount float64 `json:"amount"`
					Date   int64   `json:"date"`
				} `json:"dividends"`
			} `json:"events"`
			Meta struct {
				Currency string `json:"currency"`
			} `json:"meta"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

// --- Service Implementation ---

type priceServiceImpl struct {
	httpClient    http.Client
	isInitialized bool
	crumb         string
	mu            sync.Mutex
}

// REMOVIDO: type PriceService interface { ... } (Já está no interfaces.go)

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

	if s.isInitialized && s.crumb != "" {
		return
	}

	logger.L.Info("Initializing Yahoo Finance session and fetching Crumb...")
	const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

	req1, _ := http.NewRequest("GET", "https://fc.yahoo.com", nil)
	req1.Header.Set("User-Agent", userAgent)
	resp1, err := s.httpClient.Do(req1)
	if err == nil {
		io.Copy(io.Discard, resp1.Body)
		resp1.Body.Close()
	}

	req2, _ := http.NewRequest("GET", "https://finance.yahoo.com", nil)
	req2.Header.Set("User-Agent", userAgent)
	resp2, err := s.httpClient.Do(req2)
	if err == nil {
		io.Copy(io.Discard, resp2.Body)
		resp2.Body.Close()
	}

	req3, _ := http.NewRequest("GET", "https://query1.finance.yahoo.com/v1/test/getcrumb", nil)
	req3.Header.Set("User-Agent", userAgent)
	resp3, err := s.httpClient.Do(req3)
	if err != nil {
		logger.L.Error("Failed to fetch crumb", "error", err)
		return
	}
	defer resp3.Body.Close()

	if resp3.StatusCode == http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp3.Body)
		s.crumb = string(bodyBytes)
		s.isInitialized = true
		logger.L.Info("Yahoo session initialized successfully", "crumb", s.crumb)
	} else {
		logger.L.Warn("Failed to fetch crumb", "status", resp3.Status)
	}
}

func (s *priceServiceImpl) ensureSession() {
	s.mu.Lock()
	needsInit := !s.isInitialized || s.crumb == ""
	s.mu.Unlock()

	if needsInit {
		s.initializeYahooSession()
	}
}

// --- Implementation of Existing Methods ---

func (s *priceServiceImpl) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	s.ensureSession()
	results := make(map[string]PriceInfo)
	for _, isin := range isins {
		results[isin] = PriceInfo{Status: "UNAVAILABLE"}
	}
	if len(isins) == 0 {
		return results, nil
	}

	isinToTickerMap, err := s.getIsinToTickerMap(isins)
	if err != nil {
		return results, err
	}

	tickerToPriceMap, err := s.getTickerToPriceMap(isinToTickerMap)
	if err != nil {
		return results, err
	}

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
	metadataToUpdate := make(map[string]string)

	dbMappings, err := model.GetMappingsByISINs(database.DB, isins)
	if err != nil {
		logger.L.Error("Failed to get ISIN mappings from DB", "error", err)
	}

	isinsToFetch := []string{}
	for _, isin := range isins {
		if mapping, ok := dbMappings[isin]; ok {
			isinToTickerMap[isin] = mapping.TickerSymbol
			if !mapping.Sector.Valid || mapping.Sector.String == "" {
				metadataToUpdate[isin] = mapping.TickerSymbol
			}
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
			metadataToUpdate[isin] = ticker
		}
	}

	if len(metadataToUpdate) > 0 {
		go func() {
			for isin, ticker := range metadataToUpdate {
				time.Sleep(500 * time.Millisecond)
				sector, industry, qType, err := s.fetchMetadata(ticker)
				if err == nil {
					model.UpdateMappingMetadata(database.DB, isin, sector, industry, qType)
				}
			}
		}()
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
		return ticker, "Override", "", nil
	}
	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=1&lang=en-US", isin)
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to call Yahoo search API: %w", err)
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to read response body: %w", err)
	}
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
	quoteURL := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?crumb=%s", ticker, s.crumb)
	req, err := http.NewRequest("GET", quoteURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("failed to call Yahoo chart API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		s.mu.Lock()
		s.isInitialized = false
		s.mu.Unlock()
		return 0, "", fmt.Errorf("status 401 (Unauthorized) - Crumb invalid")
	}
	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("yahoo chart API returned non-OK status %d", resp.StatusCode)
	}
	var chartData yahooChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&chartData); err != nil {
		return 0, "", fmt.Errorf("failed to decode Yahoo chart response: %w", err)
	}
	if chartData.Chart.Error != nil {
		return 0, "", fmt.Errorf("yahoo chart API returned an error: %v", chartData.Chart.Error)
	}
	if len(chartData.Chart.Result) == 0 || chartData.Chart.Result[0].Meta.RegularMarketPrice == 0 {
		return 0, "", fmt.Errorf("no price data found")
	}
	meta := chartData.Chart.Result[0].Meta
	return meta.RegularMarketPrice, meta.Currency, nil
}

func (s *priceServiceImpl) GetHistoricalPrices(ticker string) (PriceMap, string, error) {
	s.ensureSession()
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=10y&crumb=%s", ticker, s.crumb)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to fetch history: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		s.mu.Lock()
		s.isInitialized = false
		s.mu.Unlock()
		return nil, "", fmt.Errorf("status 401 (Unauthorized)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("yahoo history api returned %d", resp.StatusCode)
	}
	var data yahooHistoryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, "", fmt.Errorf("failed to decode history json: %w", err)
	}
	if len(data.Chart.Result) == 0 {
		return nil, "", fmt.Errorf("no history result found")
	}
	result := data.Chart.Result[0]
	detectedCurrency := result.Meta.Currency
	timestamps := result.Timestamp
	if len(result.Indicators.Quote) == 0 {
		return nil, "", fmt.Errorf("no quote data found")
	}
	quotes := result.Indicators.Quote[0].Close
	if len(timestamps) != len(quotes) {
		return nil, "", fmt.Errorf("data mismatch")
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
	return priceMap, detectedCurrency, nil
}

// Implementação do novo método GetLastYearDividends
func (s *priceServiceImpl) GetLastYearDividends(ticker string) (map[time.Month]float64, string, error) {
	s.ensureSession()

	now := time.Now()
	oneYearAgo := now.AddDate(-1, 0, 0)
	period1 := oneYearAgo.Unix()
	period2 := now.Unix()

	// Use 'events=div' to fetch dividends
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?symbol=%s&period1=%d&period2=%d&interval=1d&events=div&crumb=%s", ticker, ticker, period1, period2, s.crumb)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to call Yahoo events API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("yahoo API error: status %d", resp.StatusCode)
	}

	var data yahooEventsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, "", err
	}

	if len(data.Chart.Result) == 0 {
		return make(map[time.Month]float64), "", nil
	}

	result := data.Chart.Result[0]
	currency := result.Meta.Currency
	dividendsMap := result.Events.Dividends

	// Map: Month (1-12) -> Total Dividend Amount per share for that month
	monthlyDividends := make(map[time.Month]float64)

	for _, div := range dividendsMap {
		if div.Amount > 0 {
			divDate := time.Unix(div.Date, 0)
			monthlyDividends[divDate.Month()] += div.Amount
		}
	}

	return monthlyDividends, currency, nil
}

func (s *priceServiceImpl) EnsureBenchmarkData() error {
	benchmarkTicker := "SPY"
	var count int
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	err := database.DB.QueryRow("SELECT COUNT(*) FROM daily_prices WHERE ticker_symbol = ? AND date >= ?", benchmarkTicker, yesterday).Scan(&count)
	if err == nil && count > 0 {
		return nil
	}
	prices, _, err := s.GetHistoricalPrices(benchmarkTicker)
	if err != nil {
		return fmt.Errorf("failed to fetch benchmark history: %w", err)
	}
	if len(prices) == 0 {
		return fmt.Errorf("no benchmark prices returned")
	}
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`
		INSERT INTO daily_prices (ticker_symbol, date, price, currency, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(ticker_symbol, date) DO UPDATE SET
			price = excluded.price,
			updated_at = excluded.updated_at;
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare insert: %w", err)
	}
	defer stmt.Close()
	for date, price := range prices {
		_, err := stmt.Exec(benchmarkTicker, date, price, "USD", time.Now())
		if err != nil {
			logger.L.Warn("Failed to save benchmark price", "date", date, "error", err)
			continue
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit benchmark transaction: %w", err)
	}
	return nil
}

func (s *priceServiceImpl) fetchMetadata(ticker string) (string, string, string, error) {
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=assetProfile,quoteType,fundProfile,summaryProfile&crumb=%s", ticker, s.crumb)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		s.mu.Lock()
		s.isInitialized = false
		s.mu.Unlock()
		return "", "", "", fmt.Errorf("status 401 (Unauthorized) - Crumb invalid")
	}
	if resp.StatusCode != http.StatusOK {
		return "", "", "", fmt.Errorf("status %d", resp.StatusCode)
	}
	var data yahooQuoteSummaryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", "", "", err
	}
	if len(data.QuoteSummary.Result) == 0 {
		return "", "", "", fmt.Errorf("no result")
	}
	res := data.QuoteSummary.Result[0]
	qType := strings.ToUpper(res.QuoteType.QuoteType)
	sector := res.AssetProfile.Sector
	industry := res.AssetProfile.Industry
	if sector == "" && res.FundProfile.CategoryName != "" {
		sector = res.FundProfile.CategoryName
		industry = "ETF"
	}
	if sector == "" && res.SummaryProfile.Sector != "" {
		sector = res.SummaryProfile.Sector
		industry = res.SummaryProfile.Industry
	}
	logger.L.Info("Metadata fetched", "ticker", ticker, "sector", sector, "type", qType)
	return sector, industry, qType, nil
}
