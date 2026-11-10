package services

import (
	"database/sql"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/utils"
)

// historyPriceStub has no prices, so a rebuild only depends on the stored transactions.
type historyPriceStub struct{ PriceService }

func (historyPriceStub) EnsureBenchmarkData() error { return nil }
func (historyPriceStub) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	return map[string]PriceInfo{}, nil
}
func (historyPriceStub) GetHistoricalPrices(ticker string) (PriceMap, string, error) {
	return nil, "", errors.New("no prices in tests")
}

func setupHistoryTestDB(t *testing.T) {
	t.Helper()
	logger.InitLogger("error")

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	db.SetMaxOpenConns(1) // Every connection to :memory: gets its own empty database.
	previous := database.DB
	database.DB = db
	t.Cleanup(func() {
		database.DB = previous
		db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE processed_transactions (
			id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, portfolio_id INTEGER, date TEXT,
			source TEXT DEFAULT '', product_name TEXT DEFAULT '', isin TEXT DEFAULT '', quantity INTEGER DEFAULT 0,
			original_quantity INTEGER DEFAULT 0, price REAL DEFAULT 0, transaction_type TEXT DEFAULT '',
			transaction_subtype TEXT DEFAULT '', buy_sell TEXT DEFAULT '', description TEXT DEFAULT '', amount REAL DEFAULT 0,
			currency TEXT DEFAULT 'EUR', commission REAL DEFAULT 0, order_id TEXT DEFAULT '', exchange_rate REAL DEFAULT 1,
			amount_eur REAL DEFAULT 0, country_code TEXT DEFAULT '', input_string TEXT DEFAULT '', hash_id TEXT DEFAULT '',
			cash_balance REAL DEFAULT 0, balance_currency TEXT DEFAULT ''
		);
		CREATE TABLE portfolio_snapshots (
			user_id INTEGER, portfolio_id INTEGER, date TEXT, total_equity REAL, cumulative_net_cashflow REAL,
			cash_balance REAL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, portfolio_id, date)
		);`)
	if err != nil {
		t.Fatalf("failed to create tables: %v", err)
	}
}

func insertDeposit(t *testing.T, date string, amount float64) {
	t.Helper()
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, source, transaction_type, transaction_subtype, amount, amount_eur)
		VALUES (1, 1, ?, 'ibkr', 'CASH', 'DEPOSIT', ?, ?)`, date, amount, amount)
	if err != nil {
		t.Fatalf("failed to insert deposit: %v", err)
	}
}

func assertSnapshotNetInvested(t *testing.T, date string, want float64) {
	t.Helper()
	var got float64
	err := database.DB.QueryRow(`SELECT cumulative_net_cashflow FROM portfolio_snapshots
		WHERE user_id = 1 AND portfolio_id = 1 AND date = ?`, date).Scan(&got)
	if err != nil {
		t.Fatalf("failed to read snapshot of %s: %v", date, err)
	}
	if math.Abs(got-want) > 0.001 {
		t.Errorf("net invested on %s: expected %v, got %v", date, want, got)
	}
}

// Each upload of a multi-file history rebuilds incrementally. Cash from before the rebuild
// must count once, or every upload adds all earlier deposits to the history again.
func TestRebuildUserHistoryFrom_CountsEarlierCashOnce(t *testing.T) {
	setupHistoryTestDB(t)
	service := &uploadServiceImpl{priceService: historyPriceStub{}}

	insertDeposit(t, "15-01-2025", 100)
	if err := service.RebuildUserHistory(1, 1); err != nil {
		t.Fatalf("full rebuild failed: %v", err)
	}

	insertDeposit(t, "10-02-2025", 50)
	if err := service.RebuildUserHistoryFrom(1, 1, "10-02-2025"); err != nil {
		t.Fatalf("incremental rebuild failed: %v", err)
	}

	assertSnapshotNetInvested(t, "2025-02-09", 100)
	assertSnapshotNetInvested(t, "2025-02-10", 150)

	insertDeposit(t, "05-03-2025", 25)
	if err := service.RebuildUserHistoryFrom(1, 1, "05-03-2025"); err != nil {
		t.Fatalf("second incremental rebuild failed: %v", err)
	}

	assertSnapshotNetInvested(t, "2025-03-04", 150)
	assertSnapshotNetInvested(t, "2025-03-05", 175)
}

// listingPriceStub only has history for the listing it finds when the mapped ticker has none.
type listingPriceStub struct {
	historyPriceStub
	found *string
}

func (s listingPriceStub) FindTickerWithHistory(isin, currentTicker string) (string, PriceMap, string, error) {
	*s.found = isin + " from " + currentTicker
	return "GOOD.AS", PriceMap{"2025-01-15": 12}, "EUR", nil
}

// A holding whose mapped ticker has no history must not be valued at cost, or the
// portfolio history disagrees with the live value that uses its current price.
func TestRebuildUserHistory_ValuesHoldingFromListingWithHistory(t *testing.T) {
	setupHistoryTestDB(t)
	_, err := database.DB.Exec(`
		CREATE TABLE isin_ticker_map (
			isin TEXT PRIMARY KEY, ticker_symbol TEXT, exchange TEXT, currency TEXT, company_name TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_checked_at TIMESTAMP, sector TEXT, industry TEXT, quote_type TEXT,
			sector_weights TEXT, metadata_updated_at TIMESTAMP
		);
		INSERT INTO isin_ticker_map (isin, ticker_symbol, currency) VALUES ('NL0011683594', 'BAD.SG', 'EUR');
		INSERT INTO processed_transactions
			(user_id, portfolio_id, date, source, isin, quantity, transaction_type, buy_sell, amount_eur)
			VALUES (1, 1, '15-01-2025', 'degiro', 'NL0011683594', 10, 'STOCK', 'BUY', -100);`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	var found string
	service := &uploadServiceImpl{priceService: listingPriceStub{found: &found}}
	if err := service.RebuildUserHistory(1, 1); err != nil {
		t.Fatalf("rebuild failed: %v", err)
	}

	if found != "NL0011683594 from BAD.SG" {
		t.Errorf("expected a search for another listing, got %q", found)
	}
	var equity, cash float64
	err = database.DB.QueryRow(`SELECT total_equity, cash_balance FROM portfolio_snapshots WHERE date = '2025-01-15'`).Scan(&equity, &cash)
	if err != nil {
		t.Fatalf("failed to read snapshot: %v", err)
	}
	if assets := equity - cash; math.Abs(assets-120) > 0.001 {
		t.Errorf("expected holding valued at 120 from its price, got %v", assets)
	}
}

func TestEarliestTxDate_ComparesCalendarDates(t *testing.T) {
	tests := []struct {
		name, current, candidate, want string
	}{
		{"first date", "", "28-04-2025", "28-04-2025"},
		{"earlier year with a later day of the month", "01-04-2026", "28-04-2025", "28-04-2025"},
		{"later year with an earlier day of the month", "28-04-2025", "01-04-2026", "28-04-2025"},
		{"earlier month of the same year", "10-05-2025", "20-03-2025", "20-03-2025"},
		{"same date", "10-05-2025", "10-05-2025", "10-05-2025"},
		{"invalid candidate is ignored", "10-05-2025", "invalid", "10-05-2025"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := earliestTxDate(tt.current, tt.candidate); got != tt.want {
				t.Errorf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestGetDividendTransactions_SetsSourceCountryFromOverride(t *testing.T) {
	setupHistoryTestDB(t)
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	path := filepath.Join(t.TempDir(), "overrides.json")
	content := `[{"isin": "IE0000000001", "alpha2": "GB", "note": "test", "source": "test"}]`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write overrides file: %v", err)
	}
	if err := utils.InitDividendSourceOverrides(path); err != nil {
		t.Fatalf("failed to load overrides: %v", err)
	}
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, isin, transaction_type, amount_eur, country_code)
		VALUES (1, 1, '02-10-2025', 'IE0000000001', 'DIVIDEND', 100, ?)`, utils.GetCountryCodeString("IE0000000001"))
	if err != nil {
		t.Fatalf("failed to insert dividend: %v", err)
	}

	dividends, err := (&uploadServiceImpl{}).GetDividendTransactions(1, 1)
	if err != nil {
		t.Fatalf("GetDividendTransactions returned error: %v", err)
	}

	if len(dividends) != 1 {
		t.Fatalf("expected 1 dividend, got %d", len(dividends))
	}
	if want := utils.GetDividendSourceCountry("IE0000000001"); dividends[0].DividendCountry != want {
		t.Errorf("expected source country %q, got %q", want, dividends[0].DividendCountry)
	}
	if dividends[0].DividendCountry == dividends[0].CountryCode {
		t.Errorf("expected the override to differ from the ISIN country, both were %q", dividends[0].CountryCode)
	}
}
