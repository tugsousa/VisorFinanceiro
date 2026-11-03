package processors

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

func seedRate(currency string, date time.Time, rate float64) {
	rateCache.Set("history-fetched-"+currency, true, time.Hour)
	rateCache.Set("rate-"+currency+"-"+date.Format("2006-01-02"), rate, time.Hour)
}

// noFallbackRates makes a rate missing from the cache fail, without calling the ECB.
func noFallbackRates(t *testing.T) {
	t.Helper()
	previous := fetchSingleDayRate
	fetchSingleDayRate = func(string, time.Time) (float64, error) { return 0, errors.New("no rate") }
	t.Cleanup(func() { fetchSingleDayRate = previous })
}

func TestGetExchangeRate_ConvertsMinorCurrencies(t *testing.T) {
	logger.InitLogger("error")
	date := time.Date(2026, 3, 16, 0, 0, 0, 0, time.UTC)
	seedRate("GBP", date, 0.8)

	tests := []struct {
		currency string
		want     float64
	}{
		{"GBP", 0.8},
		{"GBp", 80},
		{"GBX", 80},
	}
	for _, tt := range tests {
		t.Run(tt.currency, func(t *testing.T) {
			rate, err := GetExchangeRate(tt.currency, date)
			if err != nil {
				t.Fatalf("GetExchangeRate returned error: %v", err)
			}
			assertAmount(t, "rate", tt.want, rate)
		})
	}

	// A London share quoted at 120 pence is £1.20, so €1.50 at 0.80 GBP per EUR.
	rate, _ := GetExchangeRate("GBp", date)
	assertAmount(t, "share price in EUR", 1.5, 120/rate)
}

func TestGetExchangeRate_EmptyCurrencyFails(t *testing.T) {
	logger.InitLogger("error")
	if _, err := GetExchangeRate("", time.Now()); err == nil {
		t.Error("expected an error for an empty currency")
	}
}

func TestCacheYahooRates_UsesTheExchangeDayRegardlessOfServerTimezone(t *testing.T) {
	logger.InitLogger("error")
	// As returned by Yahoo in summer: the 13 July session is stamped 23:00 UTC on 12 July.
	summerSession := time.Date(2026, 7, 12, 23, 0, 0, 0, time.UTC).Unix()
	winterSession := time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC).Unix()

	tests := []struct {
		name     string
		currency string
		timezone string
	}{
		{"timezone reported by Yahoo", "TZA", `"exchangeTimezoneName":"Europe/London"`},
		{"timezone missing from response", "TZB", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var data yahooRateResponse
			body := fmt.Sprintf(`{"chart":{"result":[{"meta":{%s},"timestamp":[%d,%d],"indicators":{"quote":[{"close":[1.1,1.2]}]}}]}}`,
				tt.timezone, summerSession, winterSession)
			if err := json.Unmarshal([]byte(body), &data); err != nil {
				t.Fatalf("invalid test data: %v", err)
			}

			if err := cacheYahooRates(tt.currency, "EUR"+tt.currency+"=X", data); err != nil {
				t.Fatalf("cacheYahooRates returned error: %v", err)
			}

			if rate, found := rateCache.Get("rate-" + tt.currency + "-2026-07-13"); !found || rate.(float64) != 1.1 {
				t.Errorf("summer rate on 2026-07-13: got %v, found %v", rate, found)
			}
			if _, found := rateCache.Get("rate-" + tt.currency + "-2026-07-12"); found {
				t.Error("summer rate was stored under the previous day")
			}
			if rate, found := rateCache.Get("rate-" + tt.currency + "-2026-01-13"); !found || rate.(float64) != 1.2 {
				t.Errorf("winter rate on 2026-01-13: got %v, found %v", rate, found)
			}
		})
	}
}

func TestExtractRateFromResponse_ReturnsLatestObservation(t *testing.T) {
	var data models.ECBResponse
	body := `{"dataSets":[{"series":{"0:0:0:0:0":{"observations":{"0":[1.05],"2":[1.07],"10":[1.09],"1":[1.06]}}}}]}`
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		t.Fatalf("invalid test data: %v", err)
	}

	rate, err := extractRateFromResponse(data)
	if err != nil {
		t.Fatalf("extractRateFromResponse returned error: %v", err)
	}
	assertAmount(t, "rate", 1.09, rate)
}

func TestTransactionProcessor_FailsWithoutARate(t *testing.T) {
	logger.InitLogger("error")
	noFallbackRates(t)
	date := time.Date(2026, 3, 16, 0, 0, 0, 0, time.UTC)
	rateCache.Set("history-fetched-QQQ", true, time.Hour)
	seedRate("USD", date, 2)

	tests := []struct {
		name string
		tx   models.CanonicalTransaction
	}{
		{"amount in a currency without rate", models.CanonicalTransaction{Currency: "QQQ", Amount: -100}},
		{"commission on a row with a currency without rate", models.CanonicalTransaction{Currency: "QQQ", Commission: 1}},
		{"commission in its own currency without rate", models.CanonicalTransaction{Currency: "USD", Amount: -100, Commission: 1, CommissionCurrency: "QQQ"}},
		{"amount without a currency", models.CanonicalTransaction{Amount: -100}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.tx.TransactionDate = date
			processed, err := NewTransactionProcessor().Process([]models.CanonicalTransaction{tt.tx})
			if err == nil {
				t.Fatalf("expected an error, got %+v", processed)
			}
		})
	}
}

func TestTransactionProcessor_RowsWithoutValueDoNotNeedARate(t *testing.T) {
	logger.InitLogger("error")
	noFallbackRates(t)
	rateCache.Set("history-fetched-QQQ", true, time.Hour)
	date := time.Date(2026, 3, 16, 0, 0, 0, 0, time.UTC)

	for _, currency := range []string{"", "QQQ"} {
		processed, err := NewTransactionProcessor().Process([]models.CanonicalTransaction{
			{TransactionDate: date, Currency: currency, TransactionType: "PRODUCT_CHANGE"},
		})
		if err != nil {
			t.Fatalf("currency %q: Process returned error: %v", currency, err)
		}
		assertAmount(t, "rate", 1, processed[0].ExchangeRate)
	}
}
