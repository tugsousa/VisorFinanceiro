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
	"github.com/username/taxfolio/backend/src/utils"
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

type yahooSplitsResponse struct {
	Chart struct {
		Result []struct {
			Events struct {
				Splits map[string]struct {
					Date        int64   `json:"date"`
					Numerator   float64 `json:"numerator"`
					Denominator float64 `json:"denominator"`
					SplitRatio  string  `json:"splitRatio"`
				} `json:"splits"`
			} `json:"events"`
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

type StockSplit struct {
	Date  time.Time
	Ratio float64
}

// FailedISINCache stores failed ISIN lookups to avoid repeated API calls
type FailedISINCache struct {
	cache map[string]time.Time
	mu    sync.RWMutex
	ttl   time.Duration
}

func NewFailedISINCache(ttl time.Duration) *FailedISINCache {
	fc := &FailedISINCache{
		cache: make(map[string]time.Time),
		ttl:   ttl,
	}
	go fc.cleanupLoop()
	return fc
}

func (fc *FailedISINCache) IsFailed(isin string) bool {
	fc.mu.RLock()
	defer fc.mu.RUnlock()
	if lastFailed, exists := fc.cache[isin]; exists {
		if time.Since(lastFailed) < fc.ttl {
			return true
		}
	}
	return false
}

func (fc *FailedISINCache) MarkFailed(isin string) {
	fc.mu.Lock()
	defer fc.mu.Unlock()
	fc.cache[isin] = time.Now()
}

func (fc *FailedISINCache) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		fc.mu.Lock()
		now := time.Now()
		for isin, lastFailed := range fc.cache {
			if now.Sub(lastFailed) >= fc.ttl {
				delete(fc.cache, isin)
			}
		}
		fc.mu.Unlock()
	}
}

// BulkFailedISINCache provides optimized bulk operations for failed ISINs
type BulkFailedISINCache struct {
	cache *FailedISINCache
	mu    sync.RWMutex
}

func NewBulkFailedISINCache(ttl time.Duration) *BulkFailedISINCache {
	return &BulkFailedISINCache{
		cache: NewFailedISINCache(ttl),
	}
}

// CheckMultiple checks multiple ISINs for failures in a single operation
func (bfc *BulkFailedISINCache) CheckMultiple(isins []string) map[string]bool {
	bfc.mu.RLock()
	defer bfc.mu.RUnlock()

	results := make(map[string]bool, len(isins))
	for _, isin := range isins {
		results[isin] = bfc.cache.IsFailed(isin)
	}
	return results
}

// MarkMultiple marks multiple ISINs as failed in a single operation
func (bfc *BulkFailedISINCache) MarkMultiple(isins []string) {
	bfc.mu.Lock()
	defer bfc.mu.Unlock()
	now := time.Now()
	for _, isin := range isins {
		bfc.cache.cache[isin] = now
	}
}

// Enhanced circuit breaker with per-ISIN tracking and better recovery
type CircuitBreaker struct {
	mu                  sync.RWMutex
	consecutiveFailures map[string]int
	lastFailureTime     map[string]time.Time
	state               map[string]bool // true = open, false = closed
	threshold           int
	timeout             time.Duration
}

func NewCircuitBreaker(threshold int, timeout time.Duration) *CircuitBreaker {
	cb := &CircuitBreaker{
		consecutiveFailures: make(map[string]int),
		lastFailureTime:     make(map[string]time.Time),
		state:               make(map[string]bool),
		threshold:           threshold,
		timeout:             timeout,
	}
	go cb.cleanupLoop()
	return cb
}

func (cb *CircuitBreaker) IsOpen(isin string) bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	state, exists := cb.state[isin]
	if !exists {
		return false
	}

	if !state {
		return false // Closed
	}

	lastFailure, exists := cb.lastFailureTime[isin]
	if !exists {
		return false
	}

	if time.Since(lastFailure) > cb.timeout {
		return false // Timeout expired, should be half-open
	}

	return true
}

func (cb *CircuitBreaker) RecordSuccess(isin string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	delete(cb.consecutiveFailures, isin)
	delete(cb.lastFailureTime, isin)
	cb.state[isin] = false
}

func (cb *CircuitBreaker) RecordFailure(isin string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.consecutiveFailures[isin]++
	cb.lastFailureTime[isin] = time.Now()

	if cb.consecutiveFailures[isin] >= cb.threshold {
		cb.state[isin] = true
	}
}

func (cb *CircuitBreaker) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cb.mu.Lock()
		now := time.Now()
		for isin, lastFailure := range cb.lastFailureTime {
			if now.Sub(lastFailure) > cb.timeout*2 {
				delete(cb.consecutiveFailures, isin)
				delete(cb.lastFailureTime, isin)
				delete(cb.state, isin)
			}
		}
		cb.mu.Unlock()
	}
}

// BulkCircuitBreaker provides optimized bulk operations for circuit breaker checks
type BulkCircuitBreaker struct {
	cb *CircuitBreaker
	mu sync.RWMutex
}

func NewBulkCircuitBreaker(threshold int, timeout time.Duration) *BulkCircuitBreaker {
	return &BulkCircuitBreaker{
		cb: NewCircuitBreaker(threshold, timeout),
	}
}

// CheckMultiple checks multiple ISINs for open circuit breakers in a single operation
func (bcb *BulkCircuitBreaker) CheckMultiple(isins []string) map[string]bool {
	bcb.mu.RLock()
	defer bcb.mu.RUnlock()

	results := make(map[string]bool, len(isins))
	for _, isin := range isins {
		results[isin] = bcb.cb.IsOpen(isin)
	}
	return results
}

// RecordMultiple records failures for multiple ISINs in a single operation
func (bcb *BulkCircuitBreaker) RecordMultipleFailures(isins []string) {
	bcb.mu.Lock()
	defer bcb.mu.Unlock()
	now := time.Now()
	for _, isin := range isins {
		bcb.cb.consecutiveFailures[isin]++
		bcb.cb.lastFailureTime[isin] = now
		if bcb.cb.consecutiveFailures[isin] >= bcb.cb.threshold {
			bcb.cb.state[isin] = true
		}
	}
}

// RecordMultipleSuccesses records successes for multiple ISINs in a single operation
func (bcb *BulkCircuitBreaker) RecordMultipleSuccesses(isins []string) {
	bcb.mu.Lock()
	defer bcb.mu.Unlock()
	for _, isin := range isins {
		delete(bcb.cb.consecutiveFailures, isin)
		delete(bcb.cb.lastFailureTime, isin)
		bcb.cb.state[isin] = false
	}
}

// AdaptiveRequestThrottler implements adaptive token bucket throttling to prevent API rate limiting
type AdaptiveRequestThrottler struct {
	mu              sync.Mutex
	tokens          int
	capacity        int
	refillRate      time.Duration
	lastRefill      time.Time
	lastFailureTime time.Time
	failureCount    int
	baseCapacity    int
	baseRefillRate  time.Duration
}

func NewAdaptiveRequestThrottler(capacity int, refillRate time.Duration) *AdaptiveRequestThrottler {
	return &AdaptiveRequestThrottler{
		tokens:         capacity,
		capacity:       capacity,
		refillRate:     refillRate,
		lastRefill:     time.Now(),
		baseCapacity:   capacity,
		baseRefillRate: refillRate,
	}
}

func (rt *AdaptiveRequestThrottler) Allow() bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(rt.lastRefill)
	tokensToAdd := int(elapsed / rt.refillRate)

	if tokensToAdd > 0 {
		rt.tokens = min(rt.capacity, rt.tokens+tokensToAdd)
		rt.lastRefill = now
	}

	if rt.tokens > 0 {
		rt.tokens--
		return true
	}
	return false
}

func (rt *AdaptiveRequestThrottler) Wait() {
	for !rt.Allow() {
		time.Sleep(100 * time.Millisecond)
	}
}

// RecordFailure records a failed request and adapts the throttling parameters
func (rt *AdaptiveRequestThrottler) RecordFailure() {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	rt.failureCount++
	rt.lastFailureTime = time.Now()

	// Adaptive backoff: reduce capacity and increase refill rate after failures
	if rt.failureCount >= 3 {
		// Reduce capacity by 25% but not below 2
		rt.capacity = max(2, int(float64(rt.baseCapacity)*0.75))
		// Increase refill rate by 50% (slower refill)
		rt.refillRate = time.Duration(float64(rt.baseRefillRate) * 1.5)
		logger.L.Debug("Adaptive throttling: reduced capacity and increased refill rate",
			"capacity", rt.capacity,
			"refill_rate", rt.refillRate)
	}
}

// RecordSuccess records a successful request and resets throttling parameters if needed
func (rt *AdaptiveRequestThrottler) RecordSuccess() {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	// Reset if we haven't failed recently (5 minutes)
	if time.Since(rt.lastFailureTime) > 5*time.Minute {
		rt.failureCount = 0
		rt.capacity = rt.baseCapacity
		rt.refillRate = rt.baseRefillRate
	}
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type priceServiceImpl struct {
	httpClient      http.Client
	isInitialized   bool
	crumb           string
	mu              sync.Mutex
	failedISINCache *FailedISINCache
	circuitBreaker  *CircuitBreaker
	throttler       *AdaptiveRequestThrottler
	successCache    map[string]string // ISIN -> Ticker cache
	cacheMu         sync.RWMutex
}

func NewPriceService() PriceService {
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		logger.L.Error("Failed to create cookie jar", "error", err)
	}

	client := http.Client{
		Jar:     jar,
		Timeout: 30 * time.Second,
	}

	s := &priceServiceImpl{
		httpClient:      client,
		isInitialized:   false,
		failedISINCache: NewFailedISINCache(1 * time.Hour),
		circuitBreaker:  NewCircuitBreaker(10, 5*time.Minute),                 // Increased threshold, reduced timeout
		throttler:       NewAdaptiveRequestThrottler(8, 200*time.Millisecond), // 8 tokens, refill every 200ms = ~5 req/s
		successCache:    make(map[string]string),
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

	logger.L.Debug("Initializing Yahoo Finance session and fetching Crumb...")
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
		logger.L.Debug("Yahoo session initialized successfully", "crumb", s.crumb)
	} else {
		logger.L.Warn("Failed to fetch crumb", "status", resp3.Status)
	}

	s.loadFailedISINsFromDB()
}

func (s *priceServiceImpl) loadFailedISINsFromDB() {
	failedISINs, err := model.GetFailedISINs(database.DB)
	if err != nil {
		logger.L.Error("Failed to load failed ISINs from database", "error", err)
		return
	}

	s.failedISINCache.mu.Lock()
	defer s.failedISINCache.mu.Unlock()

	for isin, lastFailed := range failedISINs {
		if time.Since(lastFailed) < s.failedISINCache.ttl {
			s.failedISINCache.cache[isin] = lastFailed
		}
	}

	logger.L.Debug("Loaded failed ISINs from database", "count", len(failedISINs))
}

func (s *priceServiceImpl) ensureSession() {
	s.mu.Lock()
	needsInit := !s.isInitialized || s.crumb == ""
	s.mu.Unlock()

	if needsInit {
		s.initializeYahooSession()
	}
}

func (s *priceServiceImpl) fetchSplits(ticker string) ([]StockSplit, error) {
	now := time.Now().Unix()
	period1 := int64(946684800) // 2000-01-01

	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?symbol=%s&period1=%d&period2=%d&interval=1d&events=split&crumb=%s", ticker, ticker, period1, now, s.crumb)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return []StockSplit{}, nil
	}

	var data yahooSplitsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Chart.Result) == 0 {
		return []StockSplit{}, nil
	}

	var splits []StockSplit
	events := data.Chart.Result[0].Events.Splits

	for _, splitEvent := range events {
		if splitEvent.Denominator == 0 {
			continue
		}
		ratio := splitEvent.Numerator / splitEvent.Denominator
		splits = append(splits, StockSplit{
			Date:  time.Unix(splitEvent.Date, 0),
			Ratio: ratio,
		})
	}
	return splits, nil
}

// --- Implementation of Methods ---

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
		// --- 1.3: Filter out ISINs that have previously failed before hitting the API ---
		isinsEligible := make([]string, 0, len(isinsToFetch))
		for _, isin := range isinsToFetch {
			if s.failedISINCache.IsFailed(isin) {
				logger.L.Debug("Skipping previously-failed ISIN", "isin", isin)
				continue
			}
			isinsEligible = append(isinsEligible, isin)
		}

		// --- 1.1: Fetch tickers in parallel instead of sequentially ---
		if len(isinsEligible) > 0 {
			tickerResults := s.fetchTickersParallel(isinsEligible)

			// Collect mappings for batch insert
			var mappingsToInsert []model.ISINTickerMap
			for isin, result := range tickerResults {
				if result.Error != nil {
					logger.L.Warn("Could not get ticker for ISIN from API", "isin", isin, "error", result.Error)
					continue
				}
				isinToTickerMap[isin] = result.Ticker
				newMapping := model.ISINTickerMap{
					ISIN:         isin,
					TickerSymbol: result.Ticker,
					Exchange:     sql.NullString{String: result.Exchange, Valid: result.Exchange != ""},
					Currency:     result.Currency,
				}
				mappingsToInsert = append(mappingsToInsert, newMapping)
				metadataToUpdate[isin] = result.Ticker
			}

			// Batch insert all mappings at once
			if len(mappingsToInsert) > 0 {
				err := model.BatchInsertMappings(database.DB, mappingsToInsert)
				if err != nil {
					logger.L.Error("Failed to batch insert ISIN mappings", "error", err)
					// Fallback to individual inserts
					for _, mapping := range mappingsToInsert {
						model.InsertMapping(database.DB, mapping)
					}
				}
			}
		}
	}

	if len(metadataToUpdate) > 0 {
		go s.updateMetadataParallel(metadataToUpdate)
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

	// --- 1.2: Fetch prices in parallel instead of sequentially ---
	if len(tickersToFetch) > 0 {
		priceResults := s.fetchPricesParallel(tickersToFetch)

		for ticker, result := range priceResults {
			if result.Error != nil {
				logger.L.Warn("Could not get price for ticker from API", "ticker", ticker, "error", result.Error)
				continue
			}
			dailyPrice := model.DailyPrice{
				TickerSymbol: ticker,
				Date:         todayStr,
				Price:        result.Price,
				Currency:     result.Currency,
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

	// Check success cache first
	s.cacheMu.RLock()
	if ticker, exists := s.successCache[isin]; exists {
		s.cacheMu.RUnlock()
		logger.L.Debug("ISIN ticker found in success cache", "isin", isin, "ticker", ticker)
		return ticker, "", "", nil
	}
	s.cacheMu.RUnlock()

	// Check circuit breaker first
	if s.circuitBreaker.IsOpen(isin) {
		return "", "", "", fmt.Errorf("circuit breaker open for ISIN %s", isin)
	}

	// Check negative cache
	if s.failedISINCache.IsFailed(isin) {
		return "", "", "", fmt.Errorf("ISIN %s previously failed lookup, skipping API call", isin)
	}

	// Wait for throttler token
	s.throttler.Wait()

	searchURL := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=1&lang=en-US", isin)
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.circuitBreaker.RecordFailure(isin)
		return "", "", "", fmt.Errorf("failed to call Yahoo search API: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		s.circuitBreaker.RecordFailure(isin)
		return "", "", "", fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		s.circuitBreaker.RecordFailure(isin)
		s.failedISINCache.MarkFailed(isin)
		model.InsertFailedISIN(database.DB, isin)
		return "", "", "", fmt.Errorf("yahoo search API returned non-OK status %d", resp.StatusCode)
	}

	var searchData yahooSearchResponse
	if err := json.Unmarshal(bodyBytes, &searchData); err != nil {
		s.circuitBreaker.RecordFailure(isin)
		s.failedISINCache.MarkFailed(isin)
		model.InsertFailedISIN(database.DB, isin)
		return "", "", "", fmt.Errorf("failed to decode Yahoo search response: %w", err)
	}

	if len(searchData.Quotes) == 0 || searchData.Quotes[0].Symbol == "" {
		s.circuitBreaker.RecordFailure(isin)
		s.failedISINCache.MarkFailed(isin)
		model.InsertFailedISIN(database.DB, isin)
		return "", "", "", fmt.Errorf("no ticker symbol found for ISIN %s", isin)
	}

	quote := searchData.Quotes[0]

	// Cache successful result
	s.cacheMu.Lock()
	s.successCache[isin] = quote.Symbol
	s.cacheMu.Unlock()

	s.circuitBreaker.RecordSuccess(isin)
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

// HistoricalResult holds the result of fetching historical prices for one ticker.
type HistoricalResult struct {
	Ticker   string
	Prices   PriceMap
	Currency string
	Error    error
}

// fetchHistoricalPricesParallel fetches historical prices for multiple tickers concurrently.
// --- 2.1: Parallel Historical Price Fetching ---
func (s *priceServiceImpl) fetchHistoricalPricesParallel(tickers []string) map[string]HistoricalResult {
	const maxWorkers = 5
	const delayBetweenBatches = 1 * time.Second

	results := make(map[string]HistoricalResult)
	resultChan := make(chan HistoricalResult, len(tickers))
	workerChan := make(chan struct{}, maxWorkers)

	for i := 0; i < len(tickers); i += maxWorkers {
		end := i + maxWorkers
		if end > len(tickers) {
			end = len(tickers)
		}
		batch := tickers[i:end]

		for _, ticker := range batch {
			workerChan <- struct{}{}
			go func(t string) {
				defer func() { <-workerChan }()

				// --- 2.2: Check DB cache before hitting the API ---
				cached, err := model.GetHistoricalPricesByTicker(database.DB, t)
				if err == nil && len(cached) > 0 {
					logger.L.Debug("Historical prices served from DB cache", "ticker", t, "points", len(cached))
					resultChan <- HistoricalResult{Ticker: t, Prices: cached, Currency: ""}
					return
				}

				prices, currency, err := s.GetHistoricalPrices(t)
				if err != nil {
					resultChan <- HistoricalResult{Ticker: t, Error: err}
					return
				}

				// Persist to DB cache asynchronously so callers aren't blocked.
				go s.storeHistoricalPricesInDB(t, currency, prices)

				resultChan <- HistoricalResult{Ticker: t, Prices: prices, Currency: currency}
			}(ticker)
		}

		// Drain this batch before starting the next one.
		for range batch {
			r := <-resultChan
			results[r.Ticker] = r
		}

		if end < len(tickers) {
			time.Sleep(delayBetweenBatches)
		}
	}

	return results
}

// storeHistoricalPricesInDB persists a full PriceMap for one ticker into daily_prices.
// --- 2.2: Historical Data Caching (write side) ---
func (s *priceServiceImpl) storeHistoricalPricesInDB(ticker, currency string, prices PriceMap) {
	if len(prices) == 0 {
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("storeHistoricalPricesInDB: failed to begin tx", "ticker", ticker, "error", err)
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO daily_prices (ticker_symbol, date, price, currency, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(ticker_symbol, date) DO UPDATE SET
			price      = excluded.price,
			updated_at = excluded.updated_at;
	`)
	if err != nil {
		logger.L.Error("storeHistoricalPricesInDB: failed to prepare stmt", "ticker", ticker, "error", err)
		return
	}
	defer stmt.Close()

	now := time.Now()
	for date, price := range prices {
		if _, err := stmt.Exec(ticker, date, price, currency, now); err != nil {
			logger.L.Warn("storeHistoricalPricesInDB: failed to insert row", "ticker", ticker, "date", date, "error", err)
		}
	}

	if err := tx.Commit(); err != nil {
		logger.L.Error("storeHistoricalPricesInDB: failed to commit", "ticker", ticker, "error", err)
	} else {
		logger.L.Debug("Historical prices stored in DB cache", "ticker", ticker, "points", len(prices))
	}
}

func (s *priceServiceImpl) GetHistoricalPrices(ticker string) (PriceMap, string, error) {
	s.ensureSession()

	splits, errSplits := s.fetchSplits(ticker)
	if errSplits != nil {
		logger.L.Debug("Failed to fetch splits (continuing without adjustment)", "ticker", ticker, "error", errSplits)
	} else if len(splits) > 0 {
		logger.L.Debug("Splits found", "ticker", ticker, "count", len(splits))
	}

	now := time.Now().Unix()
	tenYearsAgo := time.Now().AddDate(-10, 0, 0).Unix()

	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?symbol=%s&period1=%d&period2=%d&interval=1d&crumb=%s", ticker, ticker, tenYearsAgo, now, s.crumb)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to fetch history: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logger.L.Warn("Yahoo history API returned non-OK status", "ticker", ticker, "status", resp.StatusCode)
		return nil, "", fmt.Errorf("yahoo history api returned %d", resp.StatusCode)
	}

	var data yahooHistoryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, "", fmt.Errorf("failed to decode history json: %w", err)
	}

	if data.Chart.Error != nil {
		return nil, "", fmt.Errorf("yahoo api returned error: %v", data.Chart.Error)
	}

	if len(data.Chart.Result) == 0 {
		logger.L.Warn("Yahoo history returned empty result list", "ticker", ticker)
		return nil, "", fmt.Errorf("no history result found")
	}

	result := data.Chart.Result[0]
	detectedCurrency := result.Meta.Currency
	timestamps := result.Timestamp

	if len(result.Indicators.Quote) == 0 {
		return nil, "", fmt.Errorf("no quote indicators found")
	}

	quotes := result.Indicators.Quote[0].Close

	if len(timestamps) == 0 {
		logger.L.Warn("Yahoo history returned zero timestamps", "ticker", ticker)
		return nil, "", fmt.Errorf("no price data points found")
	}

	priceMap := make(PriceMap)
	var sortedDates []string
	validCount := 0

	for i, ts := range timestamps {
		if i >= len(quotes) {
			break
		}

		price := quotes[i]
		if price <= 0.0001 {
			continue
		}

		currentDate := time.Unix(ts, 0)
		dateStr := currentDate.Format("2006-01-02")

		if len(splits) > 0 {
			for _, split := range splits {
				if currentDate.Before(split.Date) {
					price = price * split.Ratio
				}
			}
		}

		priceMap[dateStr] = price
		sortedDates = append(sortedDates, dateStr)
		validCount++
	}

	if validCount == 0 {
		logger.L.Warn("Yahoo history returned data but all prices were null/zero", "ticker", ticker)
		return nil, "", fmt.Errorf("no valid prices found in history")
	}

	// Forward Fill
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

func (s *priceServiceImpl) GetLastYearDividends(ticker string) (map[time.Month]float64, string, error) {
	s.ensureSession()

	now := time.Now()
	oneYearAgo := now.AddDate(-1, 0, 0)
	period1 := oneYearAgo.Unix()
	period2 := now.Unix()

	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?symbol=%s&period1=%d&period2=%d&interval=1d&events=div&crumb=%s", ticker, ticker, period1, period2, s.crumb)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

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

// TickerResult represents the result of fetching a ticker for an ISIN
type TickerResult struct {
	ISIN     string
	Ticker   string
	Exchange string
	Currency string
	Error    error
}

// fetchTickersParallel fetches tickers for multiple ISINs in parallel with optimized concurrency
func (s *priceServiceImpl) fetchTickersParallel(isins []string) map[string]TickerResult {
	const maxWorkers = 8                               // Reduced from 20 to 8 to reduce load
	const delayBetweenBatches = 100 * time.Millisecond // Increased from 500ms to 1s
	const maxRetries = 3
	const baseDelay = 100 * time.Millisecond // Increased base delay

	results := make(map[string]TickerResult)
	resultChan := make(chan TickerResult, len(isins))
	workerChan := make(chan struct{}, maxWorkers)

	for i := 0; i < len(isins); i += maxWorkers {
		end := i + maxWorkers
		if end > len(isins) {
			end = len(isins)
		}

		batch := isins[i:end]

		for _, isin := range batch {
			workerChan <- struct{}{}
			go func(isin string) {
				defer func() { <-workerChan }()

				var lastErr error
				for attempt := 0; attempt < maxRetries; attempt++ {
					// Check per-ISIN circuit breaker
					if s.circuitBreaker.IsOpen(isin) {
						logger.L.Debug("ISIN circuit breaker open, skipping", "isin", isin)
						resultChan <- TickerResult{
							ISIN:  isin,
							Error: fmt.Errorf("circuit breaker open for ISIN %s", isin),
						}
						return
					}

					ticker, exchange, currency, err := s.fetchTickerForISIN(isin)
					if err == nil {
						// Success - record success in circuit breaker
						s.circuitBreaker.RecordSuccess(isin)
						resultChan <- TickerResult{
							ISIN:     isin,
							Ticker:   ticker,
							Exchange: exchange,
							Currency: currency,
							Error:    nil,
						}
						return
					}

					lastErr = err
					s.circuitBreaker.RecordFailure(isin)

					// Exponential backoff with jitter
					delay := baseDelay * time.Duration(1<<uint(attempt))
					if delay > 3*time.Second {
						delay = 3 * time.Second
					}
					// Add jitter to prevent thundering herd
					jitter := time.Duration(utils.RandInt(50, 150)) * time.Millisecond
					time.Sleep(delay + jitter)
				}

				resultChan <- TickerResult{
					ISIN:  isin,
					Error: fmt.Errorf("failed after %d attempts: %w", maxRetries, lastErr),
				}
			}(isin)
		}

		for range batch {
			result := <-resultChan
			results[result.ISIN] = result
		}

		if end < len(isins) {
			time.Sleep(delayBetweenBatches)
		}
	}

	return results
}

// PriceResult represents the result of fetching a price for a ticker
type PriceResult struct {
	Ticker   string
	Price    float64
	Currency string
	Error    error
}

// fetchPricesParallel fetches prices for multiple tickers in parallel with controlled concurrency
func (s *priceServiceImpl) fetchPricesParallel(tickers []string) map[string]PriceResult {
	const maxWorkers = 6                               // Reduced from 8 to further reduce load
	const delayBetweenBatches = 800 * time.Millisecond // Increased from 500ms

	results := make(map[string]PriceResult)
	resultChan := make(chan PriceResult, len(tickers))
	workerChan := make(chan struct{}, maxWorkers)

	for i := 0; i < len(tickers); i += maxWorkers {
		end := i + maxWorkers
		if end > len(tickers) {
			end = len(tickers)
		}

		batch := tickers[i:end]

		for _, ticker := range batch {
			workerChan <- struct{}{}
			go func(ticker string) {
				defer func() { <-workerChan }()

				// Wait for throttler token
				s.throttler.Wait()

				price, currency, err := s.getPriceForTicker(ticker)
				resultChan <- PriceResult{
					Ticker:   ticker,
					Price:    price,
					Currency: currency,
					Error:    err,
				}
			}(ticker)
		}

		for range batch {
			result := <-resultChan
			results[result.Ticker] = result
		}

		if end < len(tickers) {
			time.Sleep(delayBetweenBatches)
		}
	}

	return results
}

// updateMetadataParallel updates metadata for multiple tickers in parallel
func (s *priceServiceImpl) updateMetadataParallel(metadataToUpdate map[string]string) {
	const maxWorkers = 4                         // Reduced from 5
	const delayBetweenRequests = 1 * time.Second // Increased from 500ms

	workerChan := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for isin, ticker := range metadataToUpdate {
		workerChan <- struct{}{}
		wg.Add(1)
		go func(isin, ticker string) {
			defer func() {
				<-workerChan
				wg.Done()
			}()

			// Wait for throttler token
			s.throttler.Wait()
			time.Sleep(delayBetweenRequests)

			sector, industry, qType, err := s.fetchMetadata(ticker)
			if err == nil {
				model.UpdateMappingMetadata(database.DB, isin, sector, industry, qType)
			}
		}(isin, ticker)
	}

	wg.Wait()
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
