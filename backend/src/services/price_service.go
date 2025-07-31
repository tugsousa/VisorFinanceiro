package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/processors"
)

// fmpISINResponse defines the structure for the FMP ISIN search API response.
type fmpISINResponse struct {
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Exchange string `json:"exchange"`
}

// fmpQuoteResponse defines the structure for the FMP Quote API response.
type fmpQuoteResponse struct {
	Symbol string  `json:"symbol"`
	Price  float64 `json:"price"`
}

// priceServiceImpl implements the PriceService interface.
type priceServiceImpl struct {
	httpClient http.Client
}

// NewPriceService creates a new instance of the price service.
func NewPriceService() PriceService {
	return &priceServiceImpl{
		httpClient: http.Client{Timeout: 15 * time.Second},
	}
}

// GetCurrentPrices is the main function that orchestrates fetching prices for a list of ISINs.
func (s *priceServiceImpl) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	result := make(map[string]PriceInfo)
	for _, isin := range isins {
		result[isin] = PriceInfo{Status: "UNAVAILABLE"}
	}
	if len(isins) == 0 {
		return result, nil
	}

	// Step 1: Check our local DB for already resolved ISINs to save API calls.
	existingMappings, err := model.GetMappingsByISINs(database.DB, isins)
	if err != nil {
		logger.L.Error("Failed to get existing ISIN mappings from DB", "error", err)
		// Continue execution, we'll just have to call the API for everything.
	}
	logger.L.Info("ISIN mapping cache check", "total_isins", len(isins), "found_in_db", len(existingMappings))

	// Step 2: Identify which ISINs we still need to look up via the API.
	neededISINs := []string{}
	for _, isin := range isins {
		if _, found := existingMappings[isin]; !found {
			neededISINs = append(neededISINs, isin)
		}
	}

	// Step 3: Resolve the missing ISINs via the FMP API.
	newlyResolvedMappings := make(map[string]model.ISINTickerMap)
	if len(neededISINs) > 0 {
		newlyResolvedMappings = s.resolveISINsFromAPI(neededISINs)
		logger.L.Info("Resolved new ISINs from API", "count", len(newlyResolvedMappings))

		// Step 4: Save the newly resolved mappings back to our DB for future use.
		for _, newMapping := range newlyResolvedMappings {
			if err := model.InsertMapping(database.DB, newMapping); err != nil {
				logger.L.Error("Failed to insert new ISIN mapping into DB", "isin", newMapping.ISIN, "error", err)
			}
		}
	}

	// Step 5: Consolidate all mappings (from DB and newly resolved).
	allMappings := existingMappings
	for isin, mapping := range newlyResolvedMappings {
		allMappings[isin] = mapping
	}

	// Step 6: Fetch prices for all available tickers.
	finalPricesEUR, err := s.fetchAndConvertPrices(allMappings)
	if err != nil {
		// This is not a fatal error; some prices might be unavailable. Log and continue.
		logger.L.Error("Error during price fetch and conversion", "error", err)
	}

	// Step 7: Populate the final result map.
	for isin, price := range finalPricesEUR {
		result[isin] = PriceInfo{Status: "OK", Price: price, Currency: "EUR"}
	}

	return result, nil
}

// resolveISINsFromAPI calls the FMP API for a list of ISINs and returns the resolved mappings.
func (s *priceServiceImpl) resolveISINsFromAPI(isins []string) map[string]model.ISINTickerMap {
	resolved := make(map[string]model.ISINTickerMap)
	apiKey := config.Cfg.FMPApiKey
	if apiKey == "" {
		logger.L.Error("FMP_API_KEY is not configured. Cannot resolve ISINs.")
		return resolved
	}

	for _, isin := range isins {
		url := fmt.Sprintf("https://financialmodelingprep.com/api/v3/search-isin/%s?apikey=%s", isin, apiKey)
		resp, err := s.httpClient.Get(url)
		if err != nil {
			logger.L.Warn("Failed to call FMP ISIN API", "isin", isin, "error", err)
			continue
		}
		defer resp.Body.Close()

		var fmpData []fmpISINResponse
		if err := json.NewDecoder(resp.Body).Decode(&fmpData); err != nil || len(fmpData) == 0 {
			logger.L.Warn("Failed to decode FMP ISIN response or no data returned", "isin", isin, "error", err)
			continue
		}

		// Priority Logic: Find the best ticker from the results.
		// Prefer EUR currency, then major exchanges like NASDAQ/NYSE.
		bestMatch := fmpData[0] // Default to the first result
		for _, item := range fmpData {
			if item.Currency == "EUR" {
				bestMatch = item
				break
			}
			if strings.Contains(item.Exchange, "NASDAQ") || strings.Contains(item.Exchange, "NYSE") {
				bestMatch = item
			}
		}

		resolved[isin] = model.ISINTickerMap{
			ISIN:         isin,
			TickerSymbol: bestMatch.Symbol,
			Exchange:     sql.NullString{String: bestMatch.Exchange, Valid: bestMatch.Exchange != ""},
			Currency:     bestMatch.Currency,
		}
		time.Sleep(100 * time.Millisecond) // Be respectful to the API rate limits
	}
	return resolved
}

// fetchAndConvertPrices gets prices for tickers and converts them to EUR.
func (s *priceServiceImpl) fetchAndConvertPrices(mappings map[string]model.ISINTickerMap) (map[string]float64, error) {
	finalPricesEUR := make(map[string]float64)
	apiKey := config.Cfg.FMPApiKey

	// Group tickers by currency to make efficient batch API calls.
	tickersByCurrency := make(map[string][]string)
	isinByTicker := make(map[string]string)
	for isin, mapping := range mappings {
		tickersByCurrency[mapping.Currency] = append(tickersByCurrency[mapping.Currency], mapping.TickerSymbol)
		isinByTicker[mapping.TickerSymbol] = isin
	}

	for currency, tickers := range tickersByCurrency {
		if len(tickers) == 0 {
			continue
		}
		url := fmt.Sprintf("https://financialmodelingprep.com/api/v3/quote/%s?apikey=%s", strings.Join(tickers, ","), apiKey)
		resp, err := s.httpClient.Get(url)
		if err != nil {
			logger.L.Warn("Failed to call FMP quote API", "currency", currency, "error", err)
			continue
		}
		defer resp.Body.Close()

		var quotes []fmpQuoteResponse
		if err := json.NewDecoder(resp.Body).Decode(&quotes); err != nil {
			logger.L.Warn("Failed to decode FMP quote response", "currency", currency, "error", err)
			continue
		}

		// Get exchange rate for the entire batch if not EUR.
		rateToEUR := 1.0
		if currency != "EUR" {
			rate, err := processors.GetExchangeRate(currency, time.Now())
			if err != nil {
				logger.L.Warn("Could not get exchange rate for currency, prices will be incorrect", "currency", currency, "error", err)
			} else if rate > 0 { // Ensure rate is not zero to avoid division by zero
				rateToEUR = rate
			}
		}

		for _, quote := range quotes {
			isin := isinByTicker[quote.Symbol]
			finalPricesEUR[isin] = quote.Price / rateToEUR
		}
	}

	return finalPricesEUR, nil
}
