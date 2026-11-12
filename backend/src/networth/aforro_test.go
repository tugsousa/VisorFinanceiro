package networth

import (
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// loadRealAforroRates reads the file that ships with the app.
func loadRealAforroRates(t *testing.T) *AforroRates {
	t.Helper()
	content, err := os.ReadFile(filepath.Join("..", "..", "data", "aforro_rates.json"))
	if err != nil {
		t.Fatalf("failed to read the rates file: %v", err)
	}
	rates, err := ParseAforroRates(content)
	if err != nil {
		t.Fatalf("the rates file is invalid: %v", err)
	}
	return rates
}

func TestAforroRatesFile(t *testing.T) {
	rates := loadRealAforroRates(t)
	for _, letter := range []string{"D", "E", "F"} {
		if _, ok := rates.Series[letter]; !ok {
			t.Fatalf("series %s is missing", letter)
		}
	}
	f, e, d := rates.Series["F"], rates.Series["E"], rates.Series["D"]

	// Figures read on IGCP's monthly notices and tables.
	for month, want := range map[string]float64{"2024-12": 2.5, "2025-05": 2.216, "2026-06": 2.215, "2026-07": 2.356, "2026-08": 2.474, "2026-11": 2.5} {
		if got := f.BaseRates[month]; got.Rate != want || got.Kind != AforroRateOfficial {
			t.Errorf("F %s = %+v, want the official %v", month, got, want)
		}
	}
	for month, want := range map[string]float64{"2025-01": 3.5, "2026-06": 3.215, "2026-07": 3.356, "2026-08": 3.474} {
		if got := e.BaseRates[month]; got.Rate != want || got.Kind != AforroRateOfficial {
			t.Errorf("E %s = %+v, want the official %v", month, got, want)
		}
		if d.BaseRates[month].Rate != want {
			t.Errorf("D %s = %v, want %v", month, d.BaseRates[month].Rate, want)
		}
	}

	// The rate of April 2025 was found on a news site only: it must not be in the file.
	for letter, s := range rates.Series {
		if _, ok := s.BaseRates["2025-04"]; ok {
			t.Errorf("series %s has a rate for April 2025, which no official source gives", letter)
		}
		for month, rate := range s.BaseRates {
			if rate.Kind == AforroRateThirdParty {
				t.Errorf("series %s, %s: a rate from a third party must not ship", letter, month)
			}
			if rate.Source == "" {
				t.Errorf("series %s, %s: no source", letter, month)
			}
			if math.Abs(rate.Rate*1000-math.Round(rate.Rate*1000)) > 1e-6 {
				t.Errorf("series %s, %s: %v has more than three decimals", letter, month, rate.Rate)
			}
			cap := 3.5
			if letter == "F" {
				cap = 2.5
			}
			if rate.Rate > cap {
				t.Errorf("series %s, %s: %v is above the series' cap of %v", letter, month, rate.Rate, cap)
			}
		}
	}
	// E and D follow the same Euribor average as F, one point above.
	for month, rate := range f.BaseRates {
		if got := e.BaseRates[month].Rate; math.Abs(got-(rate.Rate+1)) > 1e-9 {
			t.Errorf("E %s = %v, want F + 1 = %v", month, got, rate.Rate+1)
		}
	}

	if got := rates.SeriesOn(DateOf(2023, 6, 5)); got != "F" {
		t.Errorf("a subscription of 5 June 2023 is of series F, got %q", got)
	}
	if got := rates.SeriesOn(DateOf(2023, 6, 2)); got != "E" {
		t.Errorf("a subscription of 2 June 2023 is of series E, got %q", got)
	}
	if got := rates.SeriesOn(DateOf(2010, 1, 1)); got != "" {
		t.Errorf("series C isn't supported, got %q", got)
	}
	if f.RatesThrough() != "2026-11" {
		t.Errorf("rates through %q", f.RatesThrough())
	}
	// The dialog of a certificate tells the user the rates start in December 2024: keep the two in step.
	if f.RatesFrom() != "2024-12" {
		t.Errorf("rates from %q", f.RatesFrom())
	}
}

// The rate of a quarter, checked against the rows of IGCP's own tables "taxa de juro anual em vigor no
// trimestre corrente" of August 2026 (series F, E and D) and March 2025 (series E). The expected figures are
// IGCP's, not the code's.
func TestAforroQuarterRate_MatchesIGCPTables(t *testing.T) {
	rates := loadRealAforroRates(t)
	cases := []struct {
		series       string
		subscribed   time.Time
		quarterStart time.Time
		want         float64
	}{
		{"F", DateOf(2025, 10, 15), DateOf(2026, 7, 15), 2.356}, // first year: no bonus
		{"F", DateOf(2025, 7, 15), DateOf(2026, 7, 15), 2.606},  // the second year starts on the first anniversary
		{"F", DateOf(2023, 6, 15), DateOf(2026, 6, 15), 2.465},  // fourth year
		{"E", DateOf(2021, 10, 15), DateOf(2026, 7, 15), 3.856}, // fifth year: + 0.5
		{"E", DateOf(2021, 7, 15), DateOf(2026, 7, 15), 4.356},  // sixth year begins: + 1
		{"E", DateOf(2021, 1, 15), DateOf(2025, 1, 15), 4.0},    // March 2025 table, years 2 to 5
		{"E", DateOf(2018, 1, 15), DateOf(2025, 1, 15), 4.5},    // March 2025 table, years 6 to 10
		{"D", DateOf(2017, 9, 15), DateOf(2026, 6, 15), 4.215},
		{"D", DateOf(2017, 7, 15), DateOf(2026, 7, 15), 4.356},
		{"D", DateOf(2017, 8, 15), DateOf(2026, 8, 15), 4.474},
	}
	for _, c := range cases {
		s := rates.Series[c.series]
		k := 0
		for q := 1; q <= s.TermYears*4; q++ {
			if AforroCapitalisationDate(c.subscribed, q-1).Equal(c.quarterStart) {
				k = q
			}
		}
		if k == 0 {
			t.Fatalf("%s %s: no quarter starts on %s", c.series, c.subscribed.Format(DateLayout), c.quarterStart.Format(DateLayout))
		}
		base, bonus, ok := s.AforroQuarterRate(c.subscribed, k)
		if got := math.Round((base.Rate+bonus)*1000) / 1000; !ok || got != c.want {
			t.Errorf("%s subscribed %s, quarter from %s: %v (known %v), IGCP's table says %v",
				c.series, c.subscribed.Format(DateLayout), c.quarterStart.Format(DateLayout), got, ok, c.want)
		}
	}
}

func TestAforroCapitalisationDate(t *testing.T) {
	cases := []struct {
		subscribed time.Time
		k          int
		want       time.Time
	}{
		{DateOf(2023, 8, 31), 0, DateOf(2023, 8, 31)},
		{DateOf(2023, 8, 31), 1, DateOf(2023, 12, 1)}, // no 31 November: the 1st of the following month
		{DateOf(2023, 8, 31), 2, DateOf(2024, 3, 1)},  // no 31 February
		{DateOf(2023, 8, 31), 3, DateOf(2024, 5, 31)}, // counted from the subscription, not from the moved date
		{DateOf(2023, 11, 29), 1, DateOf(2024, 2, 29)},
		{DateOf(2023, 11, 30), 1, DateOf(2024, 3, 1)},
		{DateOf(2024, 1, 15), 4, DateOf(2025, 1, 15)},
		{DateOf(2023, 6, 5), 60, DateOf(2038, 6, 5)},
	}
	for _, c := range cases {
		if got := AforroCapitalisationDate(c.subscribed, c.k); !got.Equal(c.want) {
			t.Errorf("%s + %d quarters = %s, want %s", c.subscribed.Format(DateLayout), c.k, got.Format(DateLayout), c.want.Format(DateLayout))
		}
	}
}

// testAforroRates has one made-up series with a flat rate, so the arithmetic can be followed by hand.
func testAforroRates(months map[string]float64) AforroRates {
	base := map[string]AforroRate{}
	for month, rate := range months {
		base[month] = AforroRate{Rate: rate, Kind: AforroRateOfficial}
	}
	return AforroRates{Series: map[string]AforroSeries{"T": {
		TermYears: 1, From: "2020-01-01", Bonus: []AforroBonus{{FromYear: 2, ToYear: 2, PP: 0.25}}, BaseRates: base,
	}}}
}

func TestAforroEstimateFrom(t *testing.T) {
	rates := testAforroRates(map[string]float64{"2025-01": 2.5, "2025-04": 2.5, "2025-07": 2.5, "2025-10": 2.5})
	subscribed := DateOf(2025, 1, 10)

	// By hand (not an official figure): 10 000 × 2.5% / 4 × 0.72 = 45.00, then 10 045 × 0.0045 = 45.20.
	estimate, err := rates.EstimateFrom("T", subscribed, DateOf(2025, 2, 1), 10000, DateOf(2025, 8, 1))
	if err != nil {
		t.Fatal(err)
	}
	if estimate.ValueEUR != 10090.20 || len(estimate.Capitalisations) != 2 || estimate.Capitalisations[0].ValueEUR != 10045 ||
		estimate.Capitalisations[0].Date != "2025-04-10" || estimate.NextCapitalisation != "2025-10-10" || estimate.Stopped != "" {
		t.Errorf("estimate = %+v", estimate)
	}

	// Nothing accrues inside a quarter: the day before a capitalisation is worth what the day after the last was.
	before, _ := rates.EstimateFrom("T", subscribed, DateOf(2025, 2, 1), 10000, DateOf(2025, 4, 9))
	if before.ValueEUR != 10000 || len(before.Capitalisations) != 0 || before.NextCapitalisation != "2025-04-10" {
		t.Errorf("the day before the capitalisation: %+v", before)
	}

	// A value read on the capitalisation day already has that quarter: only later ones are added.
	onTheDay, _ := rates.EstimateFrom("T", subscribed, DateOf(2025, 4, 10), 10045, DateOf(2025, 8, 1))
	if onTheDay.ValueEUR != 10090.20 || len(onTheDay.Capitalisations) != 1 {
		t.Errorf("anchored on a capitalisation day: %+v", onTheDay)
	}

	// The term ends after four quarters: nothing is added after it.
	matured, _ := rates.EstimateFrom("T", subscribed, DateOf(2025, 2, 1), 10000, DateOf(2030, 1, 1))
	if len(matured.Capitalisations) != 4 || matured.Stopped != AforroStoppedMatured || matured.NextCapitalisation != "" || matured.MaturityDate != "2026-01-10" {
		t.Errorf("after the term: %+v", matured)
	}
	alreadyMatured, _ := rates.EstimateFrom("T", subscribed, DateOf(2026, 6, 1), 10200, DateOf(2030, 1, 1))
	if alreadyMatured.ValueEUR != 10200 || alreadyMatured.Stopped != AforroStoppedMatured {
		t.Errorf("anchored after the term: %+v", alreadyMatured)
	}

	// A quarter whose month has no rate stops the estimate there; it never borrows a neighbour's rate.
	gap := testAforroRates(map[string]float64{"2025-01": 2.5, "2025-07": 2.5, "2025-10": 2.5})
	stopped, err := gap.EstimateFrom("T", subscribed, DateOf(2025, 2, 1), 10000, DateOf(2025, 12, 1))
	if err != nil {
		t.Fatal(err)
	}
	if stopped.ValueEUR != 10045 || stopped.Stopped != AforroStoppedNoRate || stopped.StoppedOn != "2025-07-10" || len(stopped.Capitalisations) != 1 {
		t.Errorf("with a missing month: %+v", stopped)
	}

	for name, call := range map[string]func() (AforroEstimate, error){
		"unknown series": func() (AforroEstimate, error) { return rates.EstimateFrom("Z", subscribed, subscribed, 1, subscribed) },
		"subscribed before the series": func() (AforroEstimate, error) {
			return rates.EstimateFrom("T", DateOf(2019, 1, 1), DateOf(2025, 1, 1), 1, subscribed)
		},
		"value before the subscription": func() (AforroEstimate, error) {
			return rates.EstimateFrom("T", subscribed, DateOf(2024, 1, 1), 1, subscribed)
		},
		"no value": func() (AforroEstimate, error) { return rates.EstimateFrom("T", subscribed, subscribed, 0, subscribed) },
	} {
		if _, err := call(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestAforroQuarterRate_BonusAndMovedDates(t *testing.T) {
	// A 2-year series so the second year exists.
	rates := testAforroRates(map[string]float64{"2025-01": 2, "2025-04": 2, "2025-07": 2, "2025-10": 2, "2026-01": 2})
	s := rates.Series["T"]
	s.TermYears = 2
	subscribed := DateOf(2025, 1, 10)
	// The bonus starts with the fifth quarter (the first of the second year), not the fourth.
	if _, bonus, _ := s.AforroQuarterRate(subscribed, 4); bonus != 0 {
		t.Errorf("fourth quarter bonus = %v, want none", bonus)
	}
	if _, bonus, ok := s.AforroQuarterRate(subscribed, 5); bonus != 0.25 || !ok {
		t.Errorf("fifth quarter bonus = %v (known %v), want 0.25", bonus, ok)
	}

	// Subscribed on 31 August: the second quarter starts on 1 December, in the month after the 30 November
	// the rule would otherwise give. With different rates in the two months the rate isn't known.
	moved := testAforroRates(map[string]float64{"2025-08": 2, "2025-11": 2.1, "2025-12": 2.3}).Series["T"]
	if _, _, ok := moved.AforroQuarterRate(DateOf(2025, 8, 31), 2); ok {
		t.Error("a quarter moved to the 1st between months with different rates must not have a known rate")
	}
	same := testAforroRates(map[string]float64{"2025-08": 2, "2025-11": 2.3, "2025-12": 2.3}).Series["T"]
	if base, _, ok := same.AforroQuarterRate(DateOf(2025, 8, 31), 2); !ok || base.Rate != 2.3 {
		t.Errorf("with the same rate in both months the rate is known: %v, %v", base, ok)
	}
}
