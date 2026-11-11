package services

import (
	"errors"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
)

// addOtherAsset stores an other asset of the user with one valuation, and returns its id.
func addOtherAsset(t *testing.T, userID int64, assetType, name string, value float64) int64 {
	t.Helper()
	result, err := database.DB.Exec("INSERT INTO other_assets (user_id, type, name) VALUES (?, ?, ?)", userID, assetType, name)
	if err != nil {
		t.Fatalf("failed to insert the asset: %v", err)
	}
	id, _ := result.LastInsertId()
	if _, err := database.DB.Exec("INSERT INTO other_asset_entries (asset_id, date, kind, amount) VALUES (?, '2024-01-10', 'valuation', ?)", id, value); err != nil {
		t.Fatalf("failed to insert the valuation: %v", err)
	}
	return id
}

func TestAllocation_OtherAssetsCountInTheirGroup(t *testing.T) {
	service := setupAllocationTest(t)
	groups, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "Ações", TargetPct: 60}, {Name: "Obrigações", TargetPct: 40}})
	if err != nil {
		t.Fatal(err)
	}
	shares, bonds := groupByName(t, groups, "Ações"), groupByName(t, groups, "Obrigações")
	holdings := []AllocationAssignment{{ISIN: "X", GroupID: shares.ID, Preferred: true}, {ISIN: "BOND", GroupID: bonds.ID}}
	if err := service.SaveAllocationAssignments(1, 1, holdings); err != nil {
		t.Fatal(err)
	}
	aforro := addOtherAsset(t, 1, "savings_certificate", "Certificados de Aforro", 1000)
	house := addOtherAsset(t, 1, "real_estate", "Casa", 250000)
	worthless := addOtherAsset(t, 1, "other", "Sem valor", 0)

	// Having other assets changes nothing until one is put in a group, and they never count as unassigned.
	before, err := service.GetAllocation(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if before.TotalEUR != 4000 || before.OtherAssetsEUR != 0 || len(before.Unassigned) != 0 || before.UnassignedValueEUR != 0 {
		t.Fatalf("other assets in no group must not change the allocation: %+v", before)
	}
	if len(before.OtherAssets) != 3 || before.OtherAssets[0].Name != "Casa" || before.OtherAssets[0].GroupID != nil {
		t.Fatalf("the other assets should be offered, largest first, in no group: %+v", before.OtherAssets)
	}

	err = service.SaveAllocationAssignmentsAndOtherAssets(1, 1, holdings, []AllocationOtherAssignment{
		{OtherAssetID: aforro, GroupID: bonds.ID}, {OtherAssetID: worthless, GroupID: bonds.ID},
	})
	if err != nil {
		t.Fatalf("SaveAllocationAssignmentsAndOtherAssets failed: %v", err)
	}
	status, err := service.GetAllocation(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	// Shares 3000, bonds 1000 + 1000 outside the broker: 60% / 40%, on target.
	if status.TotalEUR != 5000 || status.OtherAssetsEUR != 1000 || status.OutsideTolerance {
		t.Fatalf("status = %+v", status)
	}
	if d := status.Drift[1]; d.ValueEUR != 2000 || d.CurrentPct != 40 || d.OtherAssetsEUR != 1000 || d.OtherAssetsCount != 2 || d.HoldingsCount != 1 {
		t.Errorf("drift of bonds = %+v", d)
	}
	for _, a := range status.OtherAssets {
		switch a.ID {
		case house:
			if a.GroupID != nil {
				t.Errorf("the house was not put in a group: %+v", a)
			}
		case worthless:
			if a.NotCounted != "no_value" || a.GroupID == nil {
				t.Errorf("an asset worth nothing stays in its group but is not counted: %+v", a)
			}
		}
	}

	// Saving the holdings alone leaves the other assets where they are.
	if err := service.SaveAllocationAssignments(1, 1, holdings); err != nil {
		t.Fatal(err)
	}
	if status, _ = service.GetAllocation(1, 1); status.OtherAssetsEUR != 1000 {
		t.Errorf("saving the holdings must not drop the other assets: %+v", status.OtherAssets)
	}

	// A deposit never buys an other asset: bonds buy BOND, as before.
	plan, err := service.PlanAllocationDeposit(1, 1, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if line := plan.Lines[1]; line.Asset == nil || line.Asset.ISIN != "BOND" || line.OutsideBroker {
		t.Errorf("bond line = %+v", line)
	}

	// A group holding only assets outside the broker gets its amount, flagged, and no shares.
	if err := service.SaveAllocationAssignmentsAndOtherAssets(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: shares.ID}},
		[]AllocationOtherAssignment{{OtherAssetID: aforro, GroupID: bonds.ID}}); err != nil {
		t.Fatal(err)
	}
	plan, err = service.PlanAllocationDeposit(1, 1, 1000)
	if err != nil {
		t.Fatal(err)
	}
	// 3000 + 1000 + 1000 = 5000: bonds need 2000 - 1000 = 1000.
	if line := plan.Lines[1]; line.AmountEUR != 1000 || line.Asset != nil || !line.OutsideBroker || line.LeftoverEUR != 1000 ||
		len(line.OutsideBrokerAssets) != 1 || line.OutsideBrokerAssets[0] != "Certificados de Aforro" {
		t.Errorf("line of a group outside the broker = %+v", line)
	}

	// Closing the asset stops it counting; it stays listed while it is in a group.
	if _, err := database.DB.Exec("UPDATE other_assets SET closed_at = '2024-06-01' WHERE id = ?", aforro); err != nil {
		t.Fatal(err)
	}
	status, _ = service.GetAllocation(1, 1)
	if status.TotalEUR != 3000 || status.OtherAssetsEUR != 0 {
		t.Errorf("a closed asset counts nothing: %+v", status)
	}
	found := false
	for _, a := range status.OtherAssets {
		if a.ID == aforro {
			found = a.NotCounted == "closed"
		}
	}
	if !found {
		t.Errorf("the closed asset should still be listed as not counted: %+v", status.OtherAssets)
	}

	// Deleting the asset takes it out of the groups; the portfolio's own figures never changed.
	if err := service.DeleteOtherAsset(1, aforro); err != nil {
		t.Fatal(err)
	}
	var rows int
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 0 {
		t.Errorf("expected no assignment left, got %d", rows)
	}
	holdingValues, err := service.GetCurrentHoldingsWithValue(1, 1)
	if err != nil || len(holdingValues) != 2 {
		t.Errorf("the portfolio's holdings changed: %+v, %v", holdingValues, err)
	}
}

func TestAllocation_OtherAssetsOwnershipAndCascade(t *testing.T) {
	service := setupAllocationTest(t)
	groups, _ := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "A", TargetPct: 50}, {Name: "B", TargetPct: 50}})
	theirGroups, _ := service.SaveAllocationGroups(2, 2, []AllocationGroup{{Name: "Z", TargetPct: 100}})
	mine := addOtherAsset(t, 1, "ppr", "PPR", 500)
	theirs := addOtherAsset(t, 2, "ppr", "Not mine", 900)
	a, b := groups[0], groups[1]

	bad := map[string][]AllocationOtherAssignment{
		"the asset of another user": {{OtherAssetID: theirs, GroupID: a.ID}},
		"an asset that is missing":  {{OtherAssetID: 9999, GroupID: a.ID}},
		"another portfolio's group": {{OtherAssetID: mine, GroupID: theirGroups[0].ID}},
		"the same asset twice":      {{OtherAssetID: mine, GroupID: a.ID}, {OtherAssetID: mine, GroupID: b.ID}},
		"no asset":                  {{OtherAssetID: 0, GroupID: a.ID}},
	}
	for name, assignments := range bad {
		if err := service.SaveAllocationAssignmentsAndOtherAssets(1, 1, nil, assignments); !errors.Is(err, ErrAllocationInput) {
			t.Errorf("%s: expected an input error, got %v", name, err)
		}
	}
	if err := service.SaveAllocationAssignmentsAndOtherAssets(2, 1, nil, []AllocationOtherAssignment{{OtherAssetID: theirs, GroupID: a.ID}}); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("writing to the portfolio of another user: %v", err)
	}
	var rows int
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 0 {
		t.Fatalf("nothing should have been written, found %d rows", rows)
	}

	// A refused save changes nothing, the holdings' groups included.
	if err := service.SaveAllocationAssignments(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: a.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := service.SaveAllocationAssignmentsAndOtherAssets(1, 1, []AllocationAssignment{{ISIN: "X", GroupID: b.ID}},
		[]AllocationOtherAssignment{{OtherAssetID: theirs, GroupID: a.ID}}); !errors.Is(err, ErrAllocationInput) {
		t.Fatalf("expected an input error, got %v", err)
	}
	if status, _ := service.GetAllocation(1, 1); len(status.Assignments) != 1 || status.Assignments[0].GroupID != a.ID {
		t.Errorf("a refused save must not move the holdings: %+v", status.Assignments)
	}

	// User 2 never sees user 1's assets.
	if status, _ := service.GetAllocation(2, 2); len(status.OtherAssets) != 1 || status.OtherAssets[0].ID != theirs {
		t.Errorf("user 2 should be offered only their own asset: %+v", status.OtherAssets)
	}

	// The same asset may count in two portfolios of its owner; deleting a group or a portfolio removes its rows.
	if _, err := database.DB.Exec("INSERT INTO portfolios (id, user_id, name) VALUES (3, 1, 'Second')"); err != nil {
		t.Fatal(err)
	}
	second, _ := service.SaveAllocationGroups(1, 3, []AllocationGroup{{Name: "Tudo", TargetPct: 100}})
	if err := service.SaveAllocationAssignmentsAndOtherAssets(1, 1, nil, []AllocationOtherAssignment{{OtherAssetID: mine, GroupID: a.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := service.SaveAllocationAssignmentsAndOtherAssets(1, 3, nil, []AllocationOtherAssignment{{OtherAssetID: mine, GroupID: second[0].ID}}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{ID: b.ID, Name: "B", TargetPct: 100}}); err != nil {
		t.Fatal(err)
	}
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 1 {
		t.Errorf("deleting group A should leave only the row of the second portfolio, found %d", rows)
	}
	if _, err := database.DB.Exec("DELETE FROM portfolios WHERE id = 3"); err != nil {
		t.Fatal(err)
	}
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 0 {
		t.Errorf("deleting the portfolio should delete its rows, found %d", rows)
	}
}
