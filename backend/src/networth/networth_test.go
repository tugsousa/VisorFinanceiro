package networth

import (
	"math"
	"testing"
	"time"
)

func day(text string) time.Time {
	t, err := ParseDate(text)
	if err != nil {
		panic(err)
	}
	return t
}

func near(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("%s = %.6f, want %.6f", name, got, want)
	}
}

// compound applies the interest of each period, given in days, to the principal, at the TANB rate
// (Actual/365), net of tax when net is true. It's the expected value worked out independently of ValueOn.
func compound(principal, rate float64, periodDays []int, net bool) float64 {
	value := principal
	for _, d := range periodDays {
		interest := value * rate * float64(d) / 365
		if net {
			interest *= 1 - WithholdingRate
		}
		value += interest
	}
	return value
}

func TestTermDeposit_SimpleInterestAtMaturity(t *testing.T) {
	d := TermDeposit{Principal: 10000, RatePct: 3, Start: day("2025-01-01"), Maturity: day("2026-01-01"), Capitalisation: CapitalisationMaturity}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}

	before := d.ValueOn(day("2024-12-31"))
	if before.Exists || before.Gross != 0 || before.Net != 0 {
		t.Errorf("before the start the deposit should be worth nothing, got %+v", before)
	}

	start := d.ValueOn(day("2025-01-01"))
	near(t, "gross on the start day", start.Gross, 10000)
	near(t, "net on the start day", start.Net, 10000)

	// 2 July 2025 is 182 days after 1 January.
	during := d.ValueOn(day("2025-07-02"))
	near(t, "gross interest during", during.InterestGross, 10000*0.03*182/365)
	near(t, "net interest during", during.InterestNet, 10000*0.03*182/365*0.72)

	// 365 days: 300 € gross, 28% withheld leaves 216 €.
	maturity := d.ValueOn(day("2026-01-01"))
	near(t, "gross at maturity", maturity.Gross, 10300)
	near(t, "net at maturity", maturity.Net, 10216)

	after := d.ValueOn(day("2027-06-30"))
	near(t, "gross after maturity", after.Gross, 10300)
	near(t, "net after maturity", after.Net, 10216)
}

func TestTermDeposit_LeapYearStillCountsOver365(t *testing.T) {
	// 2028 is a leap year: 366 days between the dates, still divided by 365 (Actual/365).
	d := TermDeposit{Principal: 1000, RatePct: 5, Start: day("2028-01-01"), Maturity: day("2029-01-01"), Capitalisation: CapitalisationMaturity}
	near(t, "gross interest", d.ValueOn(day("2029-01-01")).InterestGross, 1000*0.05*366/365)
}

func TestTermDeposit_MonthlyCapitalisationCompounds(t *testing.T) {
	d := TermDeposit{Principal: 10000, RatePct: 3, Start: day("2025-01-01"), Maturity: day("2026-01-01"), Capitalisation: CapitalisationMonthly}
	months := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}

	maturity := d.ValueOn(day("2026-01-01"))
	near(t, "gross at maturity", maturity.Gross, compound(10000, 0.03, months, false))
	near(t, "net at maturity", maturity.Net, compound(10000, 0.03, months, true))
	if maturity.Gross <= 10300 {
		t.Errorf("monthly capitalisation should earn more than simple interest, got %.2f", maturity.Gross)
	}
	// Tax is withheld at each capitalisation, so the net value isn't simply 72% of the gross interest.
	if math.Abs(maturity.InterestNet-maturity.InterestGross*0.72) < 1e-6 {
		t.Errorf("net interest should compound on the net balance")
	}

	// 15 February: January capitalised, then 14 days accrued on the new balance.
	mid := d.ValueOn(day("2025-02-15"))
	afterJanuary := compound(10000, 0.03, []int{31}, false)
	near(t, "gross mid-period", mid.Gross, afterJanuary+afterJanuary*0.03*14/365)

	after := d.ValueOn(day("2030-01-01"))
	near(t, "gross after maturity", after.Gross, maturity.Gross)
	near(t, "net after maturity", after.Net, maturity.Net)
}

func TestTermDeposit_QuarterlyWithShortLastPeriod(t *testing.T) {
	// Seven months, quarterly: periods of 90, 91 and then 31 days up to maturity.
	d := TermDeposit{Principal: 5000, RatePct: 2.5, Start: day("2025-01-01"), Maturity: day("2025-08-01"), Capitalisation: CapitalisationQuarterly}
	v := d.ValueOn(day("2025-12-31"))
	near(t, "gross", v.Gross, compound(5000, 0.025, []int{90, 91, 31}, false))
	near(t, "net", v.Net, compound(5000, 0.025, []int{90, 91, 31}, true))
}

func TestTermDeposit_MonthEndStartClampsToShorterMonths(t *testing.T) {
	// From 31 January the periods end on 28 February, 31 March and 30 April.
	d := TermDeposit{Principal: 1000, RatePct: 4, Start: day("2025-01-31"), Maturity: day("2025-04-30"), Capitalisation: CapitalisationMonthly}
	near(t, "gross", d.ValueOn(day("2025-04-30")).Gross, compound(1000, 0.04, []int{28, 31, 30}, false))
}

func TestTermDeposit_Validate(t *testing.T) {
	valid := TermDeposit{Principal: 1, RatePct: 1, Start: day("2025-01-01"), Maturity: day("2025-02-01"), Capitalisation: CapitalisationMaturity}
	cases := map[string]func(d *TermDeposit){
		"no principal":           func(d *TermDeposit) { d.Principal = 0 },
		"negative rate":          func(d *TermDeposit) { d.RatePct = -1 },
		"maturity before":        func(d *TermDeposit) { d.Maturity = day("2024-12-31") },
		"unknown capitalisation": func(d *TermDeposit) { d.Capitalisation = "weekly" },
	}
	for name, change := range cases {
		d := valid
		change(&d)
		if d.Validate() == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid deposit: %v", err)
	}
}

func TestManualValueOn(t *testing.T) {
	entries := []Entry{
		{ID: 1, Date: day("2025-01-10"), Kind: KindContribution, Amount: 1000},
		{ID: 2, Date: day("2025-02-01"), Kind: KindContribution, Amount: 500},
		{ID: 3, Date: day("2025-03-01"), Kind: KindValuation, Amount: 1600},
		{ID: 4, Date: day("2025-03-01"), Kind: KindContribution, Amount: 100}, // included in that day's valuation
		{ID: 5, Date: day("2025-04-01"), Kind: KindWithdrawal, Amount: 200},
		{ID: 6, Date: day("2025-05-01"), Kind: KindInterest, Amount: 12},
	}
	cases := []struct {
		date   string
		want   float64
		exists bool
	}{
		{"2025-01-01", 0, false},   // before the first entry
		{"2025-01-10", 1000, true}, // contributions only
		{"2025-02-15", 1500, true},
		{"2025-03-01", 1600, true}, // the valuation, which includes the same-day contribution
		{"2025-04-15", 1400, true}, // minus the later withdrawal
		{"2025-06-01", 1412, true}, // plus the later interest
	}
	for _, c := range cases {
		got, exists := ManualValueOn(entries, day(c.date))
		if exists != c.exists {
			t.Errorf("%s: exists = %v, want %v", c.date, exists, c.exists)
		}
		near(t, c.date, got, c.want)
	}

	// A later valuation replaces everything before it.
	entries = append(entries, Entry{ID: 7, Date: day("2025-07-01"), Kind: KindValuation, Amount: 2000})
	got, _ := ManualValueOn(entries, day("2025-08-01"))
	near(t, "after a new valuation", got, 2000)
}

func TestAssetValueOn_ClosedAssetIsWorthNothing(t *testing.T) {
	closed := day("2025-06-01")
	a := Asset{ID: 1, Type: TypeCashAccount, ClosedAt: &closed, Entries: []Entry{{ID: 1, Date: day("2025-01-01"), Kind: KindValuation, Amount: 300}}}
	near(t, "before closing", a.ValueOn(day("2025-05-31")).Net, 300)
	if v := a.ValueOn(day("2025-06-01")); v.Net != 0 || v.Exists {
		t.Errorf("from the closing day the asset should be worth nothing, got %+v", v)
	}
}

func TestSummarize_AddsPortfoliosAndOtherAssets(t *testing.T) {
	today := day("2025-03-15")
	portfolios := []Portfolio{
		{ID: 1, Name: "DEGIRO", HoldingsEUR: 9000, CashEUR: 1000},
		{ID: 2, Name: "IBKR", HoldingsEUR: 4000, CashEUR: -500},
	}
	assets := []Asset{
		{ID: 10, Type: TypeCashAccount, Entries: []Entry{{ID: 1, Date: day("2025-01-20"), Kind: KindValuation, Amount: 2000}}},
		{ID: 11, Type: TypePPR, Entries: []Entry{
			{ID: 2, Date: day("2025-02-10"), Kind: KindValuation, Amount: 3000},
			{ID: 3, Date: day("2025-03-01"), Kind: KindContribution, Amount: 500},
		}},
		{ID: 12, Type: TypeTermDeposit, Deposit: &TermDeposit{Principal: 10000, RatePct: 3, Start: day("2025-01-01"), Maturity: day("2026-01-01"), Capitalisation: CapitalisationMaturity}},
	}
	snapshots := []Snapshot{
		{PortfolioID: 1, Date: day("2025-01-15"), ValueEUR: 8000},
		{PortfolioID: 1, Date: day("2025-01-31"), ValueEUR: 8500},
		{PortfolioID: 1, Date: day("2025-02-27"), ValueEUR: 9500}, // no snapshot on the 28th: the last one counts
		{PortfolioID: 2, Date: day("2025-02-28"), ValueEUR: 3000},
	}

	s := Summarize(portfolios, assets, snapshots, today)

	deposit := assets[2].Deposit.ValueOn(today)
	wantOthers := 2000 + 3500 + deposit.Net
	near(t, "portfolios", s.PortfoliosEUR, 13500)
	near(t, "other assets", s.OtherAssetsEUR, round2(wantOthers))
	near(t, "total", s.TotalEUR, round2(13500+wantOthers))

	if len(s.History) != 3 {
		t.Fatalf("expected January, February and today, got %+v", s.History)
	}
	jan, feb, now := s.History[0], s.History[1], s.History[2]
	if jan.Date != "2025-01-31" || feb.Date != "2025-02-28" || now.Date != "2025-03-15" {
		t.Errorf("unexpected dates: %s %s %s", jan.Date, feb.Date, now.Date)
	}
	near(t, "January portfolios", jan.PortfoliosEUR, 8500)
	near(t, "January others", jan.OtherAssetsEUR, round2(2000+assets[2].Deposit.ValueOn(day("2025-01-31")).Net))
	near(t, "February portfolios", feb.PortfoliosEUR, 12500)
	near(t, "February others", feb.OtherAssetsEUR, round2(2000+3000+assets[2].Deposit.ValueOn(day("2025-02-28")).Net))
	near(t, "today's point is the total", now.TotalEUR, s.TotalEUR)

	if s.MonthChangeEUR == nil {
		t.Fatal("expected the change since the end of February")
	}
	near(t, "month change", *s.MonthChangeEUR, round2(s.TotalEUR-feb.TotalEUR))

	if s.ByType[0].Type != TypeBrokers {
		t.Errorf("the broker portfolios should come first, got %+v", s.ByType)
	}
	var sum float64
	for _, bt := range s.ByType {
		sum += bt.ValueEUR
	}
	near(t, "sum of the types", round2(sum), s.TotalEUR)
}

func TestSummarize_NothingYet(t *testing.T) {
	s := Summarize(nil, nil, nil, day("2025-03-15"))
	if s.TotalEUR != 0 || s.MonthChangeEUR != nil || len(s.History) != 1 {
		t.Errorf("unexpected summary %+v", s)
	}
}
