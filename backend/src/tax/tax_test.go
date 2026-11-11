package tax

import (
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/models"
)

func date(s string) time.Time {
	t, err := time.Parse("02-01-2006", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestStockSaleGainSubtractsCommissions(t *testing.T) {
	// The Meta sale of 08-01-2020: Delta 6.90, commissions 0.17.
	sale := models.SaleDetail{Delta: 6.9, Commission: 0.17}
	if got := StockSaleGain(sale); got != 6.73 {
		t.Fatalf("StockSaleGain = %v, want 6.73", got)
	}
}

func TestShortTermBoundary(t *testing.T) {
	buy := date("10-03-2025")
	if !IsShortTerm(buy, date("09-03-2026")) {
		t.Error("364 days must be short term")
	}
	if IsShortTerm(buy, date("10-03-2026")) {
		t.Error("365 days must not be short term")
	}
	if got := LongTermDate(buy); !got.Equal(date("10-03-2026")) {
		t.Errorf("LongTermDate = %v, want 10-03-2026", got)
	}
	// 2024 is a leap year: 365 days after 01-02-2024 is 31-01-2025.
	if got := LongTermDate(date("01-02-2024")); !got.Equal(date("31-01-2025")) {
		t.Errorf("LongTermDate over a leap day = %v, want 31-01-2025", got)
	}
}

func TestBalanceForYear(t *testing.T) {
	stocks := []models.SaleDetail{
		{SaleDate: "15-03-2026", BuyDate: "01-01-2020", Delta: 1000, Commission: 10}, // long term gain 990
		{SaleDate: "20-05-2026", BuyDate: "01-02-2026", Delta: -300, Commission: 5},  // short term loss -305
		{SaleDate: "20-05-2025", BuyDate: "01-02-2025", Delta: 500, Commission: 0},   // other year
	}
	options := []models.OptionSaleDetail{
		{CloseDate: "01-06-2026", Delta: 100, Commission: 2}, // 98
		{CloseDate: "01-06-2025", Delta: 999, Commission: 0}, // other year
	}
	b := BalanceForYear(stocks, options, 2026)
	if b.StockGains != 990 || b.StockLosses != -305 || b.OptionsResult != 98 {
		t.Fatalf("parts = %+v", b)
	}
	if b.Balance != 783 {
		t.Errorf("Balance = %v, want 783", b.Balance)
	}
	if b.ShortTermResult != -305 {
		t.Errorf("ShortTermResult = %v, want -305", b.ShortTermResult)
	}
	if b.EstimatedTax != 219.24 {
		t.Errorf("EstimatedTax = %v, want 219.24", b.EstimatedTax)
	}
}

func TestMarginalTax(t *testing.T) {
	cases := []struct {
		name         string
		before, gain float64
		want         float64
	}{
		{"gain in a year without other sales", 0, 1000, 280},
		{"gain fully covered by earlier losses", -1500, 1000, 0},
		{"gain partly covered by earlier losses", -400, 1000, 168},
		{"loss in a year with gains lowers the tax", 1000, -400, -112},
		{"loss in a year already negative changes nothing", -100, -400, 0},
	}
	for _, c := range cases {
		if got := MarginalTax(c.before, c.gain); got != c.want {
			t.Errorf("%s: MarginalTax(%v, %v) = %v, want %v", c.name, c.before, c.gain, got, c.want)
		}
	}
}
