package utils

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/username/taxfolio/backend/src/logger"
)

const (
	irelandString = "372 - Ireland"
	ukString      = "826 - United Kingdom of Great Britain and Northern Ireland "
)

func setupCountryData(t *testing.T) {
	t.Helper()
	logger.InitLogger("error")
	if err := InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	t.Cleanup(func() { dividendSourceOverrides = nil })
}

func loadOverrides(t *testing.T, content string) error {
	t.Helper()
	path := filepath.Join(t.TempDir(), "overrides.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write overrides file: %v", err)
	}
	return InitDividendSourceOverrides(path)
}

func TestShippedOverridesFileIsValid(t *testing.T) {
	setupCountryData(t)
	if err := InitDividendSourceOverrides("../../data/dividend_source_overrides.json"); err != nil {
		t.Fatalf("shipped overrides file is invalid: %v", err)
	}
}

func TestGetDividendSourceCountry(t *testing.T) {
	setupCountryData(t)
	err := loadOverrides(t, `[{"isin": "ie0000000001", "alpha2": "gb", "note": "test", "source": "test"}]`)
	if err != nil {
		t.Fatalf("failed to load overrides: %v", err)
	}

	if got := GetDividendSourceCountry("IE0000000001"); got != ukString {
		t.Errorf("overridden ISIN: expected %q, got %q", ukString, got)
	}
	if got := GetDividendSourceCountry("IE0000000002"); got != irelandString {
		t.Errorf("other ISIN: expected %q, got %q", irelandString, got)
	}
	// Overrides only apply to dividends, not to the general ISIN lookup.
	if got := GetCountryCodeString("IE0000000001"); got != irelandString {
		t.Errorf("GetCountryCodeString: expected %q, got %q", irelandString, got)
	}
}

func TestInitDividendSourceOverrides_InvalidFileAppliesNoOverrides(t *testing.T) {
	validEntry := `{"isin": "IE0000000001", "alpha2": "GB"}`

	tests := map[string]string{
		"malformed JSON":  `not json`,
		"invalid ISIN":    `[` + validEntry + `, {"isin": "IE00", "alpha2": "GB"}]`,
		"unknown country": `[` + validEntry + `, {"isin": "IE0000000002", "alpha2": "ZZ"}]`,
		"duplicate ISIN":  `[` + validEntry + `, {"isin": "ie0000000001", "alpha2": "FR"}]`,
	}

	for name, content := range tests {
		t.Run(name, func(t *testing.T) {
			setupCountryData(t)
			if err := loadOverrides(t, content); err == nil {
				t.Fatal("expected an error, got nil")
			}
			if got := GetDividendSourceCountry("IE0000000001"); got != irelandString {
				t.Errorf("expected fallback to %q, got %q", irelandString, got)
			}
		})
	}
}
