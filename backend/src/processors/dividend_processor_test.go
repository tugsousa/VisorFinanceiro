package processors

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

func TestCalculateTaxSummary_UsesDividendSourceOverride(t *testing.T) {
	logger.InitLogger("error")
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

	summary := NewDividendProcessor().CalculateTaxSummary([]models.ProcessedTransaction{
		{Date: "02-10-2025", ISIN: "IE0000000001", TransactionType: "DIVIDEND", AmountEUR: 100},
		{Date: "02-10-2025", ISIN: "IE0000000002", TransactionType: "DIVIDEND", AmountEUR: 50},
	})

	ukCountry := utils.GetDividendSourceCountry("IE0000000001")
	irelandCountry := utils.GetDividendSourceCountry("IE0000000002")
	if ukCountry == irelandCountry {
		t.Fatalf("expected different countries, both were %q", ukCountry)
	}
	if got := summary["2025"][ukCountry].GrossAmt; got != 100 {
		t.Errorf("%s: expected gross 100, got %v", ukCountry, got)
	}
	if got := summary["2025"][irelandCountry].GrossAmt; got != 50 {
		t.Errorf("%s: expected gross 50, got %v", irelandCountry, got)
	}
}
