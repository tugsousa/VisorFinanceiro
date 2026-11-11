package services

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/processors"
)

// allocationPriceStub prices X at 100 and BOND at 50; anything else has no price.
type allocationPriceStub struct{ historyPriceStub }

func (allocationPriceStub) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	return map[string]PriceInfo{
		"X":    {Status: "OK", Price: 100, Currency: "EUR"},
		"BOND": {Status: "OK", Price: 50, Currency: "EUR"},
	}, nil
}

// setupAllocationTest uses the real migrations, so that it tests the actual tables (and their
// cascades). User 1 owns portfolio 1; user 2 owns portfolio 2.
func setupAllocationTest(t *testing.T) *uploadServiceImpl {
	t.Helper()
	logger.InitLogger("error")

	previousDB, previousFS := database.DB, database.MigrationsFS
	database.MigrationsFS = os.DirFS(filepath.Join("..", "..", "db", "migrations"))
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB, database.MigrationsFS = previousDB, previousFS
	})

	_, err := database.DB.Exec(`
		INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at) VALUES
			(1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
			(2, 'two', 'two@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
		INSERT INTO portfolios (id, user_id, name) VALUES (1, 1, 'Mine'), (2, 2, 'Someone else''s');
		INSERT INTO isin_ticker_map (isin, ticker_symbol, currency, sector_weights) VALUES ('BOND', 'BND', 'EUR', '{"Obrigações": 0.95}');`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	// 30 X at 100 = 3000 and 20 BOND at 50 = 1000.
	insertAllocationTx(t, "02-01-2024", "X", "STOCK", "", "BUY", 30, 90, -2700, "1")
	insertAllocationTx(t, "02-01-2024", "BOND", "STOCK", "", "BUY", 20, 45, -900, "2")

	return NewUploadService(
		processors.NewTransactionProcessor(),
		processors.NewDividendProcessor(),
		processors.NewStockProcessor(),
		processors.NewOptionProcessor(),
		processors.NewCashMovementProcessor(),
		processors.NewFeeProcessor(),
		allocationPriceStub{},
		cache.New(DefaultCacheExpiration, CacheCleanupInterval),
	).(*uploadServiceImpl)
}

// insertAllocationTx stores a transaction of user 1 in portfolio 1, filling every column the real
// schema requires.
func insertAllocationTx(t *testing.T, date, isin, txType, subtype, buySell string, quantity, price, amount float64, orderID string) {
	t.Helper()
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity, price,
		 transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, order_id,
		 exchange_rate, amount_eur, country_code, input_string, hash_id)
		VALUES (1, 1, ?, 'degiro', ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'EUR', 0, ?, 1, ?, '', '', ?)`,
		date, "Product "+isin, isin, quantity, quantity, price, txType, subtype, buySell, amount, orderID, amount, "hash"+orderID)
	if err != nil {
		t.Fatalf("failed to insert transaction: %v", err)
	}
}

func groupByName(t *testing.T, groups []AllocationGroup, name string) AllocationGroup {
	t.Helper()
	for _, g := range groups {
		if g.Name == name {
			return g
		}
	}
	t.Fatalf("no group %q in %+v", name, groups)
	return AllocationGroup{}
}

func TestAllocation_DriftAndDepositPlan(t *testing.T) {
	service := setupAllocationTest(t)

	status, err := service.GetAllocation(1, 1)
	if err != nil {
		t.Fatalf("GetAllocation failed: %v", err)
	}
	if status.Configured || len(status.Unassigned) != 2 || status.TolerancePP != 5 {
		t.Fatalf("a new portfolio should have no groups and everything unassigned: %+v", status)
	}
	for _, h := range status.Holdings {
		want := "Ações"
		if h.ISIN == "BOND" {
			want = "Obrigações"
		}
		if h.SuggestedGroup != want {
			t.Errorf("%s suggested %q, want %q", h.ISIN, h.SuggestedGroup, want)
		}
	}

	groups, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{
		{Name: "Ações", TargetPct: 60, Color: "#1976d2"},
		{Name: "Obrigações", TargetPct: 40},
	})
	if err != nil {
		t.Fatalf("SaveAllocationGroups failed: %v", err)
	}
	shares, bonds := groupByName(t, groups, "Ações"), groupByName(t, groups, "Obrigações")

	status, _ = service.GetAllocation(1, 1)
	for _, h := range status.Holdings {
		if h.SuggestedGroupID == nil {
			t.Errorf("%s should have a suggested group once the groups exist", h.ISIN)
		}
	}

	err = service.SaveAllocationAssignments(1, 1, []AllocationAssignment{
		{ISIN: "X", GroupID: shares.ID, Preferred: true},
		{ISIN: "BOND", GroupID: bonds.ID},
	})
	if err != nil {
		t.Fatalf("SaveAllocationAssignments failed: %v", err)
	}

	status, err = service.GetAllocation(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	// 3000 / 4000 = 75% against 60%: 15 points over, outside the 5 point tolerance.
	if status.TotalEUR != 4000 || len(status.Unassigned) != 0 || !status.OutsideTolerance {
		t.Fatalf("status = %+v", status)
	}
	if d := status.Drift[0]; d.Name != "Ações" || d.CurrentPct != 75 || d.DiffPP != 15 || d.DiffEUR != 600 {
		t.Errorf("drift of shares = %+v", d)
	}

	// After 1000: total 5000, bonds need 2000 - 1000 = 1000, so it all goes to bonds: 20 BOND at 50.
	plan, err := service.PlanAllocationDeposit(1, 1, 1000)
	if err != nil {
		t.Fatalf("PlanAllocationDeposit failed: %v", err)
	}
	bondLine := plan.Lines[1]
	if bondLine.AmountEUR != 1000 || bondLine.Asset == nil || bondLine.Asset.ISIN != "BOND" || bondLine.Shares != 20 || bondLine.LeftoverEUR != 0 {
		t.Errorf("bond line = %+v", bondLine)
	}
	if plan.Lines[0].AmountEUR != 0 || plan.Lines[0].Shares != 0 {
		t.Errorf("shares line = %+v", plan.Lines[0])
	}

	if _, err := service.PlanAllocationDeposit(1, 1, -5); !errors.Is(err, ErrAllocationInput) {
		t.Errorf("a negative amount should be invalid input, got %v", err)
	}
}

func TestAllocation_CashGroupAndTolerance(t *testing.T) {
	service := setupAllocationTest(t)
	insertAllocationTx(t, "01-01-2024", "", "CASH", "DEPOSIT", "", 0, 0, 5000, "3") // 5000 - 2700 - 900 = 1400 cash

	groups, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{
		{Name: "Tudo", TargetPct: 70},
		{Name: "Liquidez", TargetPct: 30, IncludesCash: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	all := groupByName(t, groups, "Tudo")
	if err := service.SaveAllocationAssignments(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: all.ID}, {ISIN: "BOND", GroupID: all.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := service.SaveAllocationSettings(1, 1, AllocationSettings{TolerancePP: 10}); err != nil {
		t.Fatal(err)
	}

	status, err := service.GetAllocation(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	// 4000 + 1400 = 5400; cash 1400 / 5400 = 25.93%, within 10 points of 30%.
	if !status.CashIncluded || status.TotalEUR != 5400 || status.TolerancePP != 10 || status.OutsideTolerance {
		t.Errorf("status = %+v", status)
	}
	if d := status.Drift[1]; math.Abs(d.CurrentPct-25.93) > 0.01 || d.CashEUR != 1400 {
		t.Errorf("cash drift = %+v", d)
	}

	// The cash group has no asset, so its part of a deposit stays as cash.
	plan, err := service.PlanAllocationDeposit(1, 1, 600)
	if err != nil {
		t.Fatal(err)
	}
	cashLine := plan.Lines[1]
	if cashLine.Asset != nil || cashLine.LeftoverEUR != cashLine.AmountEUR || cashLine.AmountEUR <= 0 {
		t.Errorf("cash line = %+v", cashLine)
	}
}

func TestAllocation_SaveGroupsKeepsAssignmentsAndDeletesMissing(t *testing.T) {
	service := setupAllocationTest(t)
	groups, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "A", TargetPct: 50}, {Name: "B", TargetPct: 50}})
	if err != nil {
		t.Fatal(err)
	}
	a, b := groupByName(t, groups, "A"), groupByName(t, groups, "B")
	if err := service.SaveAllocationAssignments(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: a.ID}, {ISIN: "BOND", GroupID: b.ID}}); err != nil {
		t.Fatal(err)
	}

	// Swap the names (UNIQUE must not get in the way), and drop B.
	groups, err = service.SaveAllocationGroups(1, 1, []AllocationGroup{{ID: a.ID, Name: "B", TargetPct: 100}})
	if err != nil {
		t.Fatalf("renaming failed: %v", err)
	}
	if len(groups) != 1 || groups[0].ID != a.ID || groups[0].Name != "B" {
		t.Fatalf("groups = %+v", groups)
	}
	status, _ := service.GetAllocation(1, 1)
	if len(status.Assignments) != 1 || status.Assignments[0].ISIN != "X" {
		t.Errorf("X should keep its group and BOND lose it with the deleted group: %+v", status.Assignments)
	}

	// Names swapped between two kept groups.
	groups, _ = service.SaveAllocationGroups(1, 1, []AllocationGroup{{ID: a.ID, Name: "B", TargetPct: 50}, {Name: "A", TargetPct: 50}})
	newA := groupByName(t, groups, "A")
	if _, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{ID: a.ID, Name: "A", TargetPct: 50}, {ID: newA.ID, Name: "B", TargetPct: 50}}); err != nil {
		t.Errorf("swapping names failed: %v", err)
	}

	if _, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "A", TargetPct: 90}}); !errors.Is(err, ErrAllocationInput) {
		t.Errorf("targets not adding to 100 should be rejected, got %v", err)
	}
}

func TestAllocation_OnlyTheOwnersPortfolio(t *testing.T) {
	service := setupAllocationTest(t)
	mine, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "A", TargetPct: 100}})
	if err != nil {
		t.Fatal(err)
	}

	// User 2 can't read or write portfolio 1.
	if _, err := service.GetAllocation(2, 1); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("reading someone else's portfolio: %v", err)
	}
	if _, err := service.SaveAllocationGroups(2, 1, []AllocationGroup{{Name: "Z", TargetPct: 100}}); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("writing groups of someone else's portfolio: %v", err)
	}
	if err := service.SaveAllocationAssignments(2, 1, nil); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("writing assignments of someone else's portfolio: %v", err)
	}
	if err := service.SaveAllocationSettings(2, 1, AllocationSettings{TolerancePP: 3}); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("writing settings of someone else's portfolio: %v", err)
	}
	if _, err := service.PlanAllocationDeposit(2, 1, 100); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("planning on someone else's portfolio: %v", err)
	}

	// User 2 can't use a group of portfolio 1 in their own portfolio, nor take it over by id.
	if err := service.SaveAllocationAssignments(2, 2, []AllocationAssignment{{ISIN: "X", GroupID: mine[0].ID}}); !errors.Is(err, ErrAllocationInput) {
		t.Errorf("assigning to another portfolio's group: %v", err)
	}
	if _, err := service.SaveAllocationGroups(2, 2, []AllocationGroup{{ID: mine[0].ID, Name: "Mine now", TargetPct: 100}}); !errors.Is(err, ErrAllocationInput) {
		t.Errorf("updating another portfolio's group: %v", err)
	}
	groups, _ := loadAllocationGroups(1)
	if len(groups) != 1 || groups[0].Name != "A" {
		t.Errorf("portfolio 1's groups changed: %+v", groups)
	}
}

func TestAllocation_DeletingThePortfolioDeletesItsAllocation(t *testing.T) {
	service := setupAllocationTest(t)
	groups, _ := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "A", TargetPct: 100}})
	service.SaveAllocationAssignments(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: groups[0].ID}})
	service.SaveAllocationSettings(1, 1, AllocationSettings{TolerancePP: 3})

	if _, err := database.DB.Exec("DELETE FROM processed_transactions WHERE portfolio_id = 1"); err != nil {
		t.Fatal(err)
	}
	if _, err := database.DB.Exec("DELETE FROM portfolios WHERE id = 1"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"allocation_groups", "allocation_assignments", "allocation_settings"} {
		var count int
		database.DB.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count)
		if count != 0 {
			t.Errorf("%s still has %d rows", table, count)
		}
	}
}
