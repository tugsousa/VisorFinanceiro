package networth

import (
	"math"
	"testing"
	"time"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 0.01 }

// 100 000 € at 3.6% TAN (0.3% a month) with a 600 € payment, balance read on 15-01-2026.
var testMortgage = Mortgage{Balance: 100000, BalanceDate: DateOf(2026, time.January, 15), RatePct: 3.6, MonthlyPayment: 600}

func TestMortgageBalanceForward(t *testing.T) {
	cases := []struct {
		date time.Time
		want float64
	}{
		{DateOf(2026, time.January, 15), 100000},
		{DateOf(2026, time.February, 14), 100000}, // no payment yet
		{DateOf(2026, time.February, 15), 99700},  // 100 000 × 1.003 − 600
		{DateOf(2026, time.March, 15), 99399.1},   // 99 700 × 1.003 − 600
		{DateOf(2026, time.March, 31), 99399.1},
	}
	for _, c := range cases {
		if got := testMortgage.BalanceOn(c.date); !approx(got, c.want) {
			t.Errorf("BalanceOn(%s) = %.2f, want %.2f", c.date.Format(DateLayout), got, c.want)
		}
	}
}

func TestMortgageBalanceBackward(t *testing.T) {
	// The day before the balance date, that day's payment hasn't been made: (100 000 + 600) / 1.003.
	if got := testMortgage.BalanceOn(DateOf(2026, time.January, 14)); !approx(got, 100299.10) {
		t.Errorf("one payment back = %.2f, want 100299.10", got)
	}
	// Going back and forward again gives the same balance.
	back := Mortgage{Balance: testMortgage.BalanceOn(DateOf(2025, time.June, 15)), BalanceDate: DateOf(2025, time.June, 15), RatePct: 3.6, MonthlyPayment: 600}
	if got := back.BalanceOn(DateOf(2026, time.January, 15)); !approx(got, 100000) {
		t.Errorf("back then forward = %.2f, want 100000", got)
	}
}

func TestMortgageEdgeCases(t *testing.T) {
	noPayment := Mortgage{Balance: 50000, BalanceDate: DateOf(2026, time.January, 15), RatePct: 3}
	if got := noPayment.BalanceOn(DateOf(2027, time.January, 15)); got != 50000 {
		t.Errorf("without a payment the balance stays as given, got %v", got)
	}
	zeroRate := Mortgage{Balance: 1000, BalanceDate: DateOf(2026, time.January, 15), MonthlyPayment: 300}
	if got := zeroRate.BalanceOn(DateOf(2026, time.March, 15)); got != 400 {
		t.Errorf("at 0%% two payments of 300 leave 400, got %v", got)
	}
	if got := zeroRate.BalanceOn(DateOf(2027, time.January, 15)); got != 0 {
		t.Errorf("a loan paid off stays at zero, got %v", got)
	}
	endOfMonth := Mortgage{Balance: 1000, BalanceDate: DateOf(2026, time.January, 31), MonthlyPayment: 100}
	if got := endOfMonth.BalanceOn(DateOf(2026, time.February, 28)); got != 900 {
		t.Errorf("the payment of a 31st falls on the 28th of February, got %v", got)
	}
}

func TestMortgageValidate(t *testing.T) {
	tooSmall := Mortgage{Balance: 100000, BalanceDate: DateOf(2026, time.January, 15), RatePct: 3.6, MonthlyPayment: 300}
	if tooSmall.Validate() == nil {
		t.Error("a payment below the month's interest (300 €) must be refused")
	}
	if testMortgage.Validate() != nil {
		t.Errorf("valid mortgage refused: %v", testMortgage.Validate())
	}
}

func TestPropertyIsValuedAtItsEquity(t *testing.T) {
	property := Asset{
		ID:       1,
		Type:     TypeRealEstate,
		Mortgage: &testMortgage,
		Entries:  []Entry{{ID: 1, Date: DateOf(2025, time.June, 1), Kind: KindValuation, Amount: 250000}},
	}
	v := property.ValueOn(DateOf(2026, time.February, 20))
	if !approx(v.Gross, 250000) || !approx(v.Debt, 99700) || !approx(v.Net, 150300) {
		t.Errorf("value = %+v, want market 250000, debt 99700, equity 150300", v)
	}
	if before := property.ValueOn(DateOf(2025, time.January, 1)); before.Exists || before.Debt != 0 {
		t.Errorf("before its first value the property doesn't count, got %+v", before)
	}

	summary := Summarize(nil, []Asset{property}, nil, DateOf(2026, time.February, 20))
	if !approx(summary.DebtEUR, 99700) || !approx(summary.OtherAssetsEUR, 150300) {
		t.Errorf("summary debt %.2f, other assets %.2f; want 99700 and 150300", summary.DebtEUR, summary.OtherAssetsEUR)
	}
}

func TestRealEstateMetrics(t *testing.T) {
	p := RealEstate{PurchasePrice: 200000, PurchaseCosts: 15000, MonthlyRent: 1000, AnnualCosts: 2000, MonthlyPayment: 600}
	m := p.Metrics(250000, 100000)
	check := func(name string, got *float64, want float64) {
		if got == nil || !approx(*got, want) {
			t.Errorf("%s = %v, want %v", name, got, want)
		}
	}
	if m.Equity != 150000 || m.TotalCost != 215000 || m.NetRentalIncome != 10000 {
		t.Errorf("metrics = %+v", m)
	}
	check("LTV", m.LTVPct, 40)
	check("appreciation", m.Appreciation, 35000)
	check("appreciation %", m.AppreciationPct, 16.28)
	check("gross yield", m.GrossYieldPct, 4.8)
	check("net yield", m.NetYieldPct, 4)
	check("cash flow", m.AnnualCashFlow, 2800) // 12 000 − 2 000 − 7 200

	ownHome := RealEstate{}.Metrics(300000, 0)
	if ownHome.LTVPct != nil || ownHome.GrossYieldPct != nil || ownHome.AnnualCashFlow != nil || ownHome.Appreciation != nil {
		t.Errorf("without the data the figures are left out, got %+v", ownHome)
	}
}
