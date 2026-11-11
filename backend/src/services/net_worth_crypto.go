package services

import (
	"regexp"
	"strings"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/networth"
)

// Crypto is an other asset valued as quantity × price. The quantity comes from its entries (a contribution is
// a purchase, a withdrawal a sale) and the price from Yahoo, in EUR. It's a net worth figure only: nothing
// here reaches the transactions, the IRS page or the tax simulator.

// cryptoTickerPattern is the only shape of ticker sent to Yahoo: the coin's symbol quoted in EUR. The ticker
// goes into the request URL, so nothing else may pass.
var cryptoTickerPattern = regexp.MustCompile(`^[A-Z0-9]{1,10}-EUR$`)

// normalizeCryptoTicker turns what the user typed ("btc", "BTC-EUR") into the Yahoo ticker ("BTC-EUR").
func normalizeCryptoTicker(text string) (string, error) {
	ticker := strings.ToUpper(strings.TrimSpace(text))
	if ticker == "" {
		return "", inputErrorf("indique o símbolo da moeda, por exemplo BTC")
	}
	if !strings.Contains(ticker, "-") {
		ticker += "-EUR"
	}
	if !cryptoTickerPattern.MatchString(ticker) {
		return "", inputErrorf("símbolo inválido: use o símbolo da moeda no Yahoo Finance, por exemplo BTC (só são suportados preços em EUR)")
	}
	return ticker, nil
}

// cryptoPricer is what's needed from the price service; a stub in tests.
type cryptoPricer interface {
	GetTickerPrice(ticker string) (float64, string, error)
	GetHistoricalPrices(ticker string) (PriceMap, string, error)
}

// cryptoPriceFunc gives the prices of a coin; never nil prices, but they may be empty.
type cryptoPriceFunc func(ticker string) *networth.CryptoPrices

const (
	cryptoPricesTTL       = 15 * time.Minute
	cryptoPricesFailedTTL = 2 * time.Minute // retry sooner after a failure, without calling Yahoo on every request
)

func (s *uploadServiceImpl) cryptoPrices(ticker string) *networth.CryptoPrices {
	if s.priceService == nil {
		return &networth.CryptoPrices{}
	}
	return loadCryptoPrices(s.priceService, s.reportCache, ticker, today())
}

// loadCryptoPrices reads a coin's daily closes and current price, keeping them in memory for a few minutes.
// The prices aren't written to daily_prices, which the portfolio history and the benchmark read. A failure
// never returns an error: the daily closes fall back to the last ones read, and a missing current price
// leaves the asset valued at its last close (or at cost when there's none), which the caller reports.
func loadCryptoPrices(pricer cryptoPricer, c *cache.Cache, ticker string, now time.Time) *networth.CryptoPrices {
	freshKey := "crypto_prices_" + ticker
	lastKey := "crypto_prices_last_" + ticker
	if c != nil {
		if cached, found := c.Get(freshKey); found {
			return cached.(*networth.CryptoPrices)
		}
	}

	prices := &networth.CryptoPrices{}
	complete := true
	daily, currency, err := pricer.GetHistoricalPrices(ticker)
	if err == nil && strings.EqualFold(currency, "EUR") {
		prices.Daily = daily
	} else {
		complete = false
		logger.L.Warn("Failed to read the price history of a crypto asset", "ticker", ticker, "currency", currency, "error", err)
		if c != nil {
			if last, found := c.Get(lastKey); found {
				prices.Daily = last.(map[string]float64)
			}
		}
	}
	live, currency, err := pricer.GetTickerPrice(ticker)
	if err == nil && live > 0 && strings.EqualFold(currency, "EUR") {
		prices.Live = live
		prices.LiveDate = now
	} else {
		complete = false
		logger.L.Warn("Failed to read the current price of a crypto asset", "ticker", ticker, "currency", currency, "error", err)
	}

	if c != nil {
		ttl := cryptoPricesTTL
		if !complete {
			ttl = cryptoPricesFailedTTL
		}
		c.Set(freshKey, prices, ttl)
		if prices.Daily != nil {
			c.Set(lastKey, prices.Daily, cache.NoExpiration)
		}
	}
	return prices
}

// checkCryptoTicker confirms, when an asset is created, that Yahoo has a price in EUR for the ticker, so a
// typo doesn't become an asset that can never be valued.
func (s *uploadServiceImpl) checkCryptoTicker(ticker string) error {
	if s.priceService == nil {
		return nil
	}
	price, currency, err := s.priceService.GetTickerPrice(ticker)
	if err != nil || price <= 0 {
		return inputErrorf("não foi encontrado preço para %s no Yahoo Finance; confirme o símbolo e a ligação à internet", ticker)
	}
	if !strings.EqualFold(currency, "EUR") {
		return inputErrorf("o preço de %s no Yahoo Finance não está em EUR", ticker)
	}
	return nil
}

// cryptoEntries converts stored entries into what the networth package counts quantities with.
func cryptoEntries(entries []OtherAssetEntry) ([]networth.Entry, error) {
	result := make([]networth.Entry, 0, len(entries))
	for _, e := range entries {
		date, err := networth.ParseDate(e.Date)
		if err != nil {
			return nil, err
		}
		entry := networth.Entry{ID: e.ID, Date: date, Kind: e.Kind, Amount: e.Amount}
		if e.Quantity != nil {
			entry.Quantity = *e.Quantity
		}
		result = append(result, entry)
	}
	return result, nil
}
