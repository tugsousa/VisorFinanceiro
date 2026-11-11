package services

import (
	"errors"
	"testing"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/utils"
)

func newTaxTestService() *uploadServiceImpl {
	return NewUploadService(
		processors.NewTransactionProcessor(),
		processors.NewDividendProcessor(),
		processors.NewStockProcessor(),
		processors.NewOptionProcessor(),
		processors.NewCashMovementProcessor(),
		processors.NewFeeProcessor(),
		historyPriceStub{},
		cache.New(DefaultCacheExpiration, CacheCleanupInterval),
	).(*uploadServiceImpl)
}

func insertStockTrade(t *testing.T, date, isin, buySell string, quantity, price float64, orderID string) {
	t.Helper()
	amount := quantity * price
	if buySell == "BUY" {
		amount = -amount
	}
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity, price,
		 transaction_type, buy_sell, amount, amount_eur, order_id)
		VALUES (1, 1, ?, 'degiro', ?, ?, ?, ?, ?, 'STOCK', ?, ?, ?, ?)`,
		date, "Product "+isin, isin, quantity, quantity, price, buySell, amount, amount, orderID)
	if err != nil {
		t.Fatalf("failed to insert trade: %v", err)
	}
}

func daysAgo(days int) string {
	return today().AddDate(0, 0, -days).Format(utils.DefaultDateFormat)
}

func TestSimulateStockSale_UsesFIFOAndThisYearsLosses(t *testing.T) {
	setupHistoryTestDB(t)
	service := newTaxTestService()

	// Two lots of X: an old one at 100 and a recent one (100 days) at 110.
	insertStockTrade(t, "01-02-2020", "X", "BUY", 10, 100, "1")
	insertStockTrade(t, daysAgo(100), "X", "BUY", 10, 110, "2")
	// A loss of 100 already realized this year on Y.
	insertStockTrade(t, "01-01-2021", "Y", "BUY", 5, 50, "3")
	insertStockTrade(t, daysAgo(0), "Y", "SELL", 5, 30, "4")

	sim, err := service.SimulateStockSale(1, 1, SaleSimulationRequest{ISIN: "X", Quantity: 15, PriceEUR: 120})
	if err != nil {
		t.Fatalf("SimulateStockSale failed: %v", err)
	}

	if len(sim.Lots) != 2 {
		t.Fatalf("expected 2 lots, got %+v", sim.Lots)
	}
	old, recent := sim.Lots[0], sim.Lots[1]
	if old.BuyDate != "01-02-2020" || old.Quantity != 10 || old.Gain != 200 || old.ShortTerm {
		t.Errorf("old lot = %+v, want 10 shares from 01-02-2020, gain 200, long term", old)
	}
	if recent.Quantity != 5 || recent.Gain != 50 || !recent.ShortTerm || recent.DaysHeld != 100 {
		t.Errorf("recent lot = %+v, want 5 shares, gain 50, short term, 100 days", recent)
	}
	if recent.LongTermDate != daysAgo(100-365) {
		t.Errorf("recent lot turns long term on %s, want %s", recent.LongTermDate, daysAgo(100-365))
	}

	if sim.Gain != 250 || sim.ShortTermGain != 50 {
		t.Errorf("gain = %v (short term %v), want 250 (50)", sim.Gain, sim.ShortTermGain)
	}
	if sim.YearBefore.Balance != -100 || sim.YearAfter.Balance != 150 {
		t.Errorf("balance before/after = %v/%v, want -100/150", sim.YearBefore.Balance, sim.YearAfter.Balance)
	}
	// Only the 150 above the earlier loss pays tax: 150 × 28% = 42.
	if sim.MarginalTax != 42 {
		t.Errorf("marginal tax = %v, want 42", sim.MarginalTax)
	}
	if sim.NetProceeds != 1800-42 {
		t.Errorf("net proceeds = %v, want %v", sim.NetProceeds, 1800-42)
	}
}

func TestSimulateStockSale_DoesNotChangeTheRealSales(t *testing.T) {
	setupHistoryTestDB(t)
	service := newTaxTestService()
	insertStockTrade(t, "01-02-2020", "X", "BUY", 10, 100, "1")
	insertStockTrade(t, "01-03-2021", "X", "SELL", 4, 90, "2")

	before, err := service.GetStockSaleDetails(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SimulateStockSale(1, 1, SaleSimulationRequest{ISIN: "X", Quantity: 6, PriceEUR: 120}); err != nil {
		t.Fatal(err)
	}
	after, err := service.GetStockSaleDetails(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(before) != 1 || len(after) != 1 || before[0] != after[0] {
		t.Errorf("the real sales changed: before %+v, after %+v", before, after)
	}

	lots, err := service.currentLotsByISIN(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(lots["X"]) != 1 || lots["X"][0].Quantity != 6 {
		t.Errorf("the open lots changed: %+v", lots["X"])
	}
}

func TestSimulateStockSale_RejectsMoreThanHeld(t *testing.T) {
	setupHistoryTestDB(t)
	service := newTaxTestService()
	insertStockTrade(t, "01-02-2020", "X", "BUY", 10, 100, "1")

	cases := []SaleSimulationRequest{
		{ISIN: "X", Quantity: 11, PriceEUR: 120},
		{ISIN: "X", Quantity: 0, PriceEUR: 120},
		{ISIN: "Z", Quantity: 1, PriceEUR: 120},
	}
	for _, req := range cases {
		if _, err := service.SimulateStockSale(1, 1, req); !errors.Is(err, ErrSimulationInput) {
			t.Errorf("%+v: expected ErrSimulationInput, got %v", req, err)
		}
	}
}

func TestToday_IsMidnightUTC(t *testing.T) {
	d := today()
	if d.Hour() != 0 || d.Minute() != 0 || d.Location() != time.UTC {
		t.Errorf("today() = %v, want midnight UTC", d)
	}
}
