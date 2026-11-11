package services

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/networth"
)

// portfolioValuerStub values each portfolio with fixed holdings and cash.
type portfolioValuerStub struct {
	holdings map[int64][]models.HoldingWithValue
	cash     map[int64]float64
}

func (s portfolioValuerStub) GetCurrentHoldingsWithValue(_ int64, portfolioID int64) ([]models.HoldingWithValue, error) {
	return s.holdings[portfolioID], nil
}

func (s portfolioValuerStub) GetCurrentCashBalance(_ int64, portfolioID int64) (float64, error) {
	return s.cash[portfolioID], nil
}

// setupNetWorthDB runs the real migrations on a temporary database.
func setupNetWorthDB(t *testing.T) {
	t.Helper()
	logger.InitLogger("error")
	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join(workingDir, "..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chdir(workingDir) })

	previous := database.DB
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB = previous
	})
}

func TestBuildNetWorth_AddsEveryPortfolioAndTheOtherAssets(t *testing.T) {
	setupNetWorthDB(t)
	_, err := database.DB.Exec(`
		INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at) VALUES
			(1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
			(2, 'two', 'two@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
		INSERT INTO portfolios (id, user_id, name, is_default) VALUES (1, 1, 'DEGIRO', 1), (2, 1, 'IBKR', 0), (3, 2, 'Other user', 1);
		INSERT INTO portfolio_snapshots (user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance) VALUES
			(1, 1, '2025-01-31', 9000, 8000, 100),
			(1, 2, '2025-01-30', 2000, 2000, 0),
			(1, 1, '2025-02-28', 9500, 8000, 100),
			(2, 3, '2025-02-28', 99999, 0, 0);
		INSERT INTO other_assets (id, user_id, type, name, opened_at, details) VALUES
			(1, 1, 'cash_account', 'Conta', NULL, NULL),
			(2, 1, 'term_deposit', 'DP', '2025-01-01', '{"principal":10000,"rate_pct":3,"maturity":"2026-01-01","capitalisation":"maturity"}'),
			(3, 2, 'ppr', 'Not mine', NULL, NULL);
		INSERT INTO other_asset_entries (asset_id, date, kind, amount) VALUES
			(1, '2025-01-15', 'valuation', 1000),
			(1, '2025-03-01', 'contribution', 250),
			(3, '2025-01-15', 'valuation', 77777);`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	valuer := portfolioValuerStub{
		holdings: map[int64][]models.HoldingWithValue{
			1: {
				{ISIN: "A", Quantity: 10, Status: "OK", MarketValueEUR: 8000, TotalCostBasisEUR: -7000},
				{ISIN: "B", Quantity: 5, Status: "NOT_FOUND", TotalCostBasisEUR: -500}, // at cost, as on the dashboard
			},
			2: {{ISIN: "C", Quantity: 1, Status: "OK", MarketValueEUR: 2500, TotalCostBasisEUR: -2000}},
		},
		cash: map[int64]float64{1: 1500, 2: -100},
	}
	now := networth.DateOf(2025, 3, 15)

	var snapshotsBefore int
	database.DB.QueryRow("SELECT COUNT(*) FROM portfolio_snapshots").Scan(&snapshotsBefore)

	nw, err := buildNetWorth(1, valuer, now)
	if err != nil {
		t.Fatal(err)
	}

	if len(nw.Portfolios) != 2 || nw.Portfolios[0].Name != "DEGIRO" {
		t.Fatalf("expected the user's two portfolios, default first, got %+v", nw.Portfolios)
	}
	if nw.Portfolios[0].TotalEUR != 10000 || nw.Portfolios[0].UnpricedHoldings != 1 || nw.Portfolios[1].TotalEUR != 2400 {
		t.Errorf("unexpected portfolio values %+v", nw.Portfolios)
	}
	deposit := networth.TermDeposit{Principal: 10000, RatePct: 3, Start: networth.DateOf(2025, 1, 1), Maturity: networth.DateOf(2026, 1, 1), Capitalisation: "maturity"}
	depositNow := round2(deposit.ValueOn(now).Net)
	if nw.PortfoliosEUR != 12400 {
		t.Errorf("portfolios = %v, want 12400", nw.PortfoliosEUR)
	}
	if nw.OtherAssetsEUR != round2(1250+depositNow) {
		t.Errorf("other assets = %v, want %v", nw.OtherAssetsEUR, round2(1250+depositNow))
	}
	if nw.TotalEUR != round2(12400+1250+depositNow) {
		t.Errorf("total = %v", nw.TotalEUR)
	}
	if len(nw.Assets) != 2 {
		t.Errorf("expected only the user's two assets, got %+v", nw.Assets)
	}

	// January and February from the snapshots of the user's portfolios only, then today.
	if len(nw.History) != 3 {
		t.Fatalf("unexpected history %+v", nw.History)
	}
	if nw.History[0].PortfoliosEUR != 11000 || nw.History[1].PortfoliosEUR != 11500 {
		t.Errorf("unexpected portfolio history %+v", nw.History)
	}
	if nw.MonthChangeEUR == nil || *nw.MonthChangeEUR != round2(nw.TotalEUR-nw.History[1].TotalEUR) {
		t.Errorf("unexpected month change %v", nw.MonthChangeEUR)
	}

	var snapshotsAfter int
	database.DB.QueryRow("SELECT COUNT(*) FROM portfolio_snapshots").Scan(&snapshotsAfter)
	if snapshotsAfter != snapshotsBefore {
		t.Errorf("the net worth must not write portfolio snapshots")
	}
}

func TestOtherAssets_PropertyWithMortgageCountsItsEquity(t *testing.T) {
	setupNetWorthDB(t)
	if _, err := database.DB.Exec(`INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at)
		VALUES (1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	service := &uploadServiceImpl{}
	todayText := today().Format(networth.DateLayout)
	value := 250000.0
	details := OtherAssetDetails{
		Usage: networth.UsageRented, PurchasePrice: 200000, PurchaseCosts: 15000,
		MortgageBalance: 100000, MortgageBalanceDate: todayText, MortgageRatePct: 3.6, MortgagePayment: 600,
		MonthlyRent: 1000, AnnualCosts: 2000,
	}

	asset, err := service.CreateOtherAsset(1, OtherAssetInput{Type: "real_estate", Name: "Apartamento", Details: &details, InitialValue: &value})
	if err != nil {
		t.Fatalf("CreateOtherAsset failed: %v", err)
	}
	if asset.ValueEUR != 150000 || asset.GrossValueEUR != 250000 || asset.DebtEUR != 100000 {
		t.Errorf("value %v, market %v, debt %v; want 150000, 250000, 100000", asset.ValueEUR, asset.GrossValueEUR, asset.DebtEUR)
	}
	if asset.RealEstate == nil || asset.RealEstate.NetYieldPct == nil || *asset.RealEstate.NetYieldPct != 4 {
		t.Errorf("expected the property figures, got %+v", asset.RealEstate)
	}
	if asset.Details == nil || asset.Details.MonthlyRent != 1000 || asset.Details.Usage != "rented" {
		t.Errorf("details not stored: %+v", asset.Details)
	}

	nw, err := buildNetWorth(1, portfolioValuerStub{}, today())
	if err != nil {
		t.Fatal(err)
	}
	if nw.DebtEUR != 100000 || nw.OtherAssetsEUR != 150000 {
		t.Errorf("net worth debt %v, other assets %v; want 100000 and 150000", nw.DebtEUR, nw.OtherAssetsEUR)
	}

	// Paying the loan off is an edit of the balance.
	details.MortgageBalance = 0
	details.MortgagePayment = 0
	updated, err := service.UpdateOtherAsset(1, asset.ID, OtherAssetInput{Name: "Apartamento", Details: &details})
	if err != nil {
		t.Fatalf("UpdateOtherAsset failed: %v", err)
	}
	if updated.ValueEUR != 250000 || updated.DebtEUR != 0 {
		t.Errorf("after paying off: value %v, debt %v", updated.ValueEUR, updated.DebtEUR)
	}

	bad := []OtherAssetDetails{
		{Usage: "castle"},
		{MortgageBalance: 100000, MortgageBalanceDate: todayText, MortgageRatePct: 3.6, MortgagePayment: 100}, // below the interest
		{MortgageBalance: 100000}, // no date
		{MonthlyRent: -1},
	}
	for _, d := range bad {
		d := d
		if _, err := service.CreateOtherAsset(1, OtherAssetInput{Type: "real_estate", Name: "X", Details: &d, InitialValue: &value}); !errors.Is(err, ErrOtherAssetInput) {
			t.Errorf("%+v: expected an input error, got %v", d, err)
		}
	}
}
