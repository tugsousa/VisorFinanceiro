package handlers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
)

func TestAllocationEndpoints_OtherAssets(t *testing.T) {
	h := setupAllocationHandlerTest(t)
	if rec := callAllocation(h.HandleSaveAllocationGroups, http.MethodPut, "/api/allocation/groups?portfolio_id=1", 1,
		`{"groups":[{"name":"Ações","target_pct":80},{"name":"Seguro","target_pct":20}]}`); rec.Code != http.StatusOK {
		t.Fatalf("saving groups: %d %s", rec.Code, rec.Body.String())
	}
	_, err := database.DB.Exec(`
		INSERT INTO other_assets (id, user_id, type, name) VALUES (1, 1, 'savings_certificate', 'Aforro'), (2, 2, 'ppr', 'Not mine');
		INSERT INTO other_asset_entries (asset_id, date, kind, amount) VALUES (1, '2024-01-10', 'valuation', 5000), (2, '2024-01-10', 'valuation', 900);`)
	if err != nil {
		t.Fatal(err)
	}
	var groupID int64
	database.DB.QueryRow("SELECT id FROM allocation_groups WHERE portfolio_id = 1 AND name = 'Seguro'").Scan(&groupID)
	target := "/api/allocation/assignments?portfolio_id=1"
	body := func(assetID int64) string {
		return `{"assignments":[],"other_assets":[{"other_asset_id":` + itoa(assetID) + `,"group_id":` + itoa(groupID) + `}]}`
	}

	if rec := callAllocation(h.HandleSaveAllocationAssignments, http.MethodPut, target, 1, body(2)); rec.Code != http.StatusBadRequest {
		t.Errorf("the asset of another user: got %d %s, want 400", rec.Code, rec.Body.String())
	}
	if rec := callAllocation(h.HandleSaveAllocationAssignments, http.MethodPut, target, 1, body(1)); rec.Code != http.StatusOK {
		t.Fatalf("saving the other asset: %d %s", rec.Code, rec.Body.String())
	}
	rec := callAllocation(h.HandleGetAllocation, http.MethodGet, "/api/allocation?portfolio_id=1", 1, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"other_assets_eur":5000`) || strings.Contains(rec.Body.String(), "Not mine") {
		t.Errorf("reading: %d %s", rec.Code, rec.Body.String())
	}

	// A body without "other_assets" (an older page) leaves them as they are; an empty list clears them.
	if rec := callAllocation(h.HandleSaveAllocationAssignments, http.MethodPut, target, 1, `{"assignments":[]}`); rec.Code != http.StatusOK {
		t.Fatalf("saving without other assets: %d", rec.Code)
	}
	var rows int
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 1 {
		t.Errorf("the other asset should still be in its group, found %d rows", rows)
	}
	if rec := callAllocation(h.HandleSaveAllocationAssignments, http.MethodPut, target, 1, `{"assignments":[],"other_assets":[]}`); rec.Code != http.StatusOK {
		t.Fatalf("clearing the other assets: %d", rec.Code)
	}
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_other_assignments").Scan(&rows)
	if rows != 0 {
		t.Errorf("an empty list should clear them, found %d rows", rows)
	}
}
