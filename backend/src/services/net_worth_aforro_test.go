package services

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/networth"
)

// useTestAforroRates sets a series "F" with a flat 2.5% from 2023 on, so the amounts can be followed by hand:
// each quarter adds 2.5% / 4 × 0.72 = 0.45%.
func useTestAforroRates(t *testing.T, months ...string) {
	t.Helper()
	base := map[string]networth.AforroRate{}
	for _, month := range months {
		base[month] = networth.AforroRate{Rate: 2.5, Kind: networth.AforroRateOfficial}
	}
	SetAforroRates(&networth.AforroRates{Series: map[string]networth.AforroSeries{
		"F": {Name: "Série F", TermYears: 15, From: "2023-06-05", BaseRates: base},
		"E": {Name: "Série E", TermYears: 10, From: "2017-10-30", To: "2023-06-02", BaseRates: base},
	}})
	t.Cleanup(func() { SetAforroRates(nil) })
}

func setupAforroUser(t *testing.T) *uploadServiceImpl {
	t.Helper()
	setupNetWorthDB(t)
	if _, err := database.DB.Exec(`INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at) VALUES
		(1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
		(2, 'two', 'two@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	return &uploadServiceImpl{}
}

// monthsBack is the first day-of-month-10 date at least n months ago, as YYYY-MM-DD, and its month.
func tenthMonthsAgo(n int) time.Time {
	now := today()
	return time.Date(now.Year(), now.Month()-time.Month(n), 10, 0, 0, 0, 0, time.UTC)
}

func TestAforro_ValuedByTheRates(t *testing.T) {
	service := setupAforroUser(t)
	// Subscribed 14 months ago on the 10th; every month since then has a rate.
	subscribed := tenthMonthsAgo(14)
	var months []string
	for m := 0; m <= 15; m++ {
		months = append(months, subscribed.AddDate(0, m, 0).Format("2006-01"))
	}
	useTestAforroRates(t, months...)
	if subscribed.Format(networth.DateLayout) < "2023-06-05" {
		t.Skip("the test's dates fall before series F")
	}

	// The user read 10 000 on AforroNet the day after the fourth capitalisation (12 months in).
	anchor := networth.AforroCapitalisationDate(subscribed, 4).AddDate(0, 0, 1)
	value := 10000.0
	asset, err := service.CreateOtherAsset(1, OtherAssetInput{
		Type: "savings_certificate", Name: "CA Série F", OpenedAt: subscribed.Format(networth.DateLayout),
		Details: &OtherAssetDetails{Series: "f"}, InitialValue: &value, InitialDate: anchor.Format(networth.DateLayout),
	})
	if err != nil {
		t.Fatalf("CreateOtherAsset failed: %v", err)
	}
	if asset.Details == nil || asset.Details.Series != "F" {
		t.Fatalf("the series should be stored: %+v", asset.Details)
	}
	// The fifth quarter ended since (14 months ≥ 15 months only when today is past the 10th; either 0 or 1).
	fifth := networth.AforroCapitalisationDate(subscribed, 5)
	wantQuarters := 0
	if !fifth.After(today()) {
		wantQuarters = 1
	}
	wantValue := 10000.0
	if wantQuarters == 1 {
		wantValue = 10045.0
	}
	// The value that counts is the one worked out by the rates, and the estimate explains it.
	estimate := asset.AforroEstimate
	if asset.ValueEUR != wantValue || estimate == nil || !estimate.CountedInTotal {
		t.Fatalf("asset = %+v, estimate = %+v", asset, estimate)
	}
	if estimate.Status != AforroStatusOK || len(estimate.Capitalisations) != wantQuarters || estimate.ValueEUR != wantValue || estimate.DifferenceEUR != 0 {
		t.Fatalf("estimate = %+v (%+v), want %d quarters and %v", estimate, estimate.AforroEstimate, wantQuarters, wantValue)
	}

	nw, err := buildNetWorth(1, portfolioValuerStub{}, nil, today())
	if err != nil {
		t.Fatal(err)
	}
	if nw.TotalEUR != wantValue || nw.OtherAssetsEUR != wantValue || nw.History[len(nw.History)-1].TotalEUR != wantValue {
		t.Errorf("the value worked out by the rates should be in the totals and the history: %+v", nw)
	}
	if nw.Assets[0].AforroEstimate == nil {
		t.Errorf("the net worth should carry the estimate of the asset")
	}
}

func TestAforro_ValueFollowsTheRates(t *testing.T) {
	service := setupAforroUser(t)
	// Subscribed 20 months ago: anchored after the 4th quarter, the 5th and 6th have ended since.
	subscribed := tenthMonthsAgo(20)
	if subscribed.Format(networth.DateLayout) < "2023-06-05" {
		t.Skip("the test's dates fall before series F")
	}
	var months []string
	for m := 0; m <= 21; m++ {
		months = append(months, subscribed.AddDate(0, m, 0).Format("2006-01"))
	}
	useTestAforroRates(t, months...)
	anchor := networth.AforroCapitalisationDate(subscribed, 4).AddDate(0, 0, 1)
	value := 10000.0
	asset, err := service.CreateOtherAsset(1, OtherAssetInput{
		Type: "savings_certificate", Name: "CA", OpenedAt: subscribed.Format(networth.DateLayout),
		Details: &OtherAssetDetails{Series: "F"}, InitialValue: &value, InitialDate: anchor.Format(networth.DateLayout),
	})
	if err != nil {
		t.Fatal(err)
	}
	// By hand: 10 000 → 10 045.00 → 10 090.20, and that's what counts.
	if e := asset.AforroEstimate; e == nil || e.ValueEUR != 10090.20 || len(e.Capitalisations) != 2 || asset.ValueEUR != 10090.20 {
		t.Fatalf("value %v, estimate = %+v", asset.ValueEUR, asset.AforroEstimate)
	}

	// A note that looks like an accepted estimate can't be typed by hand.
	if _, err := service.AddOtherAssetEntry(1, asset.ID, OtherAssetEntryInput{Date: anchor.Format(networth.DateLayout), Kind: "valuation", Amount: 1, Note: AforroEstimateNote}); !errors.Is(err, ErrOtherAssetInput) {
		t.Errorf("the reserved note should be refused, got %v", err)
	}
	// Another user can't accept it.
	if _, err := service.AddOtherAssetEntry(2, asset.ID, OtherAssetEntryInput{Estimate: true}); !errors.Is(err, ErrOtherAssetNotFound) {
		t.Errorf("accepting on the asset of another user: %v", err)
	}
	// There's nothing to accept: the value is already the one worked out.
	if _, err := service.AddOtherAssetEntry(1, asset.ID, OtherAssetEntryInput{Estimate: true}); !errors.Is(err, ErrOtherAssetInput) {
		t.Errorf("accepting a value that already counts should be refused, got %v", err)
	}

	// An estimate accepted before certificates were valued by their rates is skipped: the rates give it again.
	sixth := networth.AforroCapitalisationDate(subscribed, 6).Format(networth.DateLayout)
	if _, err := database.DB.Exec(`INSERT INTO other_asset_entries (asset_id, date, kind, amount, note) VALUES (?, ?, 'valuation', 99999, ?)`,
		asset.ID, sixth, AforroEstimateNote); err != nil {
		t.Fatal(err)
	}
	if again, _ := service.getOtherAsset(1, asset.ID); again.ValueEUR != 10090.20 || again.AforroEstimate.FromValueEUR != 10000 {
		t.Errorf("an old accepted estimate should be skipped: value %v, estimate %+v", again.ValueEUR, again.AforroEstimate.AforroEstimate)
	}

	// Money moved after the value was read: the rates can't value it, so the last value plus the movement counts.
	if _, err := service.AddOtherAssetEntry(1, asset.ID, OtherAssetEntryInput{Date: today().Format(networth.DateLayout), Kind: "contribution", Amount: 500}); err != nil {
		t.Fatal(err)
	}
	moved, _ := service.getOtherAsset(1, asset.ID)
	if moved.AforroEstimate == nil || moved.AforroEstimate.Status != AforroStatusUnavailable || moved.AforroEstimate.AforroEstimate != nil || moved.ValueEUR != 10500 {
		t.Errorf("with a later movement: value %v, estimate %+v", moved.ValueEUR, moved.AforroEstimate)
	}
}

func TestAforro_StopsWhereTheRatesEnd(t *testing.T) {
	service := setupAforroUser(t)
	subscribed := tenthMonthsAgo(20)
	if subscribed.Format(networth.DateLayout) < "2023-06-05" {
		t.Skip("the test's dates fall before series F")
	}
	// Rates only up to the start of the fifth quarter: the sixth quarter can't be estimated.
	var months []string
	for m := 0; m <= 12; m++ {
		months = append(months, subscribed.AddDate(0, m, 0).Format("2006-01"))
	}
	useTestAforroRates(t, months...)
	anchor := networth.AforroCapitalisationDate(subscribed, 4).AddDate(0, 0, 1)
	value := 10000.0
	asset, err := service.CreateOtherAsset(1, OtherAssetInput{
		Type: "savings_certificate", Name: "CA", OpenedAt: subscribed.Format(networth.DateLayout),
		Details: &OtherAssetDetails{Series: "F"}, InitialValue: &value, InitialDate: anchor.Format(networth.DateLayout),
	})
	if err != nil {
		t.Fatal(err)
	}
	e := asset.AforroEstimate
	if e == nil || e.Status != AforroStatusRatesEnded || e.ValueEUR != 10045 || e.Reason == "" || e.RatesThrough != months[len(months)-1] {
		t.Errorf("estimate = %+v (%+v)", e, e.AforroEstimate)
	}
}

func TestAforro_CertificatesWithoutASeriesAreAsBefore(t *testing.T) {
	service := setupAforroUser(t)
	value := 5000.0
	in := OtherAssetInput{Type: "savings_certificate", Name: "Certificados de Aforro", InitialValue: &value, InitialDate: "2025-01-10"}

	// With the rates loaded and without: the asset has no series, so nothing about it changes.
	plain, err := service.CreateOtherAsset(1, in)
	if err != nil {
		t.Fatal(err)
	}
	useTestAforroRates(t, "2025-01")
	withRates, _ := service.getOtherAsset(1, plain.ID)
	a, _ := json.Marshal(plain)
	b, _ := json.Marshal(withRates)
	if string(a) != string(b) || plain.AforroEstimate != nil || plain.Details != nil || plain.ValueEUR != 5000 {
		t.Errorf("an asset without a series must be returned as before:\n%s\n%s", a, b)
	}

	bad := map[string]OtherAssetInput{
		"series without a date":    {Type: "savings_certificate", Name: "X", Details: &OtherAssetDetails{Series: "F"}},
		"unknown series":           {Type: "savings_certificate", Name: "X", OpenedAt: "2024-01-10", Details: &OtherAssetDetails{Series: "C"}},
		"date of another series":   {Type: "savings_certificate", Name: "X", OpenedAt: "2020-01-10", Details: &OtherAssetDetails{Series: "F"}},
		"date before any series":   {Type: "savings_certificate", Name: "X", OpenedAt: "2010-01-10", Details: &OtherAssetDetails{Series: "E"}},
		"subscribed in the future": {Type: "savings_certificate", Name: "X", OpenedAt: "2999-01-10", Details: &OtherAssetDetails{Series: "F"}},
	}
	for name, input := range bad {
		if _, err := service.CreateOtherAsset(1, input); !errors.Is(err, ErrOtherAssetInput) {
			t.Errorf("%s: expected an input error, got %v", name, err)
		}
	}

	// The series is of no use on the other types.
	ppr, err := service.CreateOtherAsset(1, OtherAssetInput{Type: "ppr", Name: "PPR", Details: &OtherAssetDetails{Series: "F"}, InitialValue: &value})
	if err != nil || ppr.Details != nil || ppr.AforroEstimate != nil {
		t.Errorf("a PPR keeps no series: %+v, %v", ppr, err)
	}
}

func TestLoadAforroRates_TheRealFileAndFailures(t *testing.T) {
	t.Cleanup(func() { SetAforroRates(nil) })
	if err := LoadAforroRates(filepath.Join("..", "..", "data", "aforro_rates.json")); err != nil {
		t.Fatalf("the rates file that ships with the app must load: %v", err)
	}
	if rates := currentAforroRates(); rates == nil || len(rates.Series) != 3 {
		t.Fatalf("rates = %+v", rates)
	}

	// A missing or broken file turns the estimates off instead of failing anything else.
	if err := LoadAforroRates(filepath.Join(t.TempDir(), "missing.json")); err == nil || currentAforroRates() != nil {
		t.Errorf("a missing file should turn the estimates off, got %v", err)
	}
	broken := filepath.Join(t.TempDir(), "broken.json")
	os.WriteFile(broken, []byte(`{"series":{"F":{"term_years":15,"from":"2023-06-05","base_rates":{"2025-01":{"rate":99,"kind":"official"}}}}}`), 0o600)
	if err := LoadAforroRates(broken); err == nil || currentAforroRates() != nil {
		t.Errorf("a rate out of range should be refused, got %v", err)
	}

	service := setupAforroUser(t)
	value := 100.0
	asset, err := service.CreateOtherAsset(1, OtherAssetInput{
		Type: "savings_certificate", Name: "CA", OpenedAt: "2024-01-10", Details: &OtherAssetDetails{Series: "F"}, InitialValue: &value, InitialDate: "2025-01-15",
	})
	if err != nil {
		t.Fatalf("without the rates a certificate can still be stored: %v", err)
	}
	if asset.ValueEUR != 100 || asset.AforroEstimate == nil || asset.AforroEstimate.Status != AforroStatusUnavailable {
		t.Errorf("without rates: %+v, %+v", asset, asset.AforroEstimate)
	}
	if _, err := buildNetWorth(1, portfolioValuerStub{}, nil, today()); err != nil {
		t.Errorf("the net worth must still work without the rates: %v", err)
	}
}
