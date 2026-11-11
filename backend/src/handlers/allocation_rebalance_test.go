package handlers

import (
	"net/http"
	"strings"
	"testing"
)

func TestAllocationEndpoints_RebalancePlan(t *testing.T) {
	h := setupAllocationHandlerTest(t)
	target := "/api/allocation/rebalance-plan?portfolio_id=1"

	// Without groups there's nothing to rebalance.
	if rec := callAllocation(h.HandleAllocationRebalancePlan, http.MethodGet, target, 1, ""); rec.Code != http.StatusBadRequest {
		t.Errorf("no groups yet: got %d %s, want 400", rec.Code, rec.Body.String())
	}
	if rec := callAllocation(h.HandleAllocationRebalancePlan, http.MethodGet, "/api/allocation/rebalance-plan", 1, ""); rec.Code != http.StatusBadRequest {
		t.Errorf("no portfolio: got %d, want 400", rec.Code)
	}

	if rec := callAllocation(h.HandleSaveAllocationGroups, http.MethodPut, "/api/allocation/groups?portfolio_id=1", 1,
		`{"groups":[{"name":"Ações","target_pct":80},{"name":"Obrigações","target_pct":20}]}`); rec.Code != http.StatusOK {
		t.Fatalf("saving groups: %d %s", rec.Code, rec.Body.String())
	}
	rec := callAllocation(h.HandleAllocationRebalancePlan, http.MethodGet, target, 1, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"sales":[]`) || !strings.Contains(rec.Body.String(), `"total_tax_eur":0`) {
		t.Errorf("an empty portfolio has nothing to sell: %d %s", rec.Code, rec.Body.String())
	}

	// Another user gets 404.
	if rec := callAllocation(h.HandleAllocationRebalancePlan, http.MethodGet, target, 2, ""); rec.Code != http.StatusNotFound {
		t.Errorf("another user: got %d %s, want 404", rec.Code, rec.Body.String())
	}
}
