package allocation

import (
	"errors"
	"math"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) < 0.011 }

func groupValues() []GroupValue {
	// 80/20 target, currently 9000 in shares and 1000 in bonds: 90% / 10%.
	return []GroupValue{
		{Group: Group{ID: 1, Name: "Ações", TargetPct: 80}, ValueEUR: 9000},
		{Group: Group{ID: 2, Name: "Obrigações", TargetPct: 20}, ValueEUR: 1000},
	}
}

func TestComputeDrift(t *testing.T) {
	drift := ComputeDrift(groupValues(), 5)
	if len(drift) != 2 {
		t.Fatalf("got %d groups, want 2", len(drift))
	}
	shares, bonds := drift[0], drift[1]
	if !near(shares.CurrentPct, 90) || !near(shares.DiffPP, 10) || !near(shares.DiffEUR, 1000) || !near(shares.TargetValueEUR, 8000) {
		t.Errorf("shares drift = %+v", shares)
	}
	if !near(bonds.CurrentPct, 10) || !near(bonds.DiffPP, -10) || !near(bonds.DiffEUR, -1000) {
		t.Errorf("bonds drift = %+v", bonds)
	}
	if !shares.OutsideTolerance || !bonds.OutsideTolerance {
		t.Errorf("10 points off should be outside a 5 point tolerance")
	}
	if ComputeDrift(groupValues(), 10)[0].OutsideTolerance {
		t.Errorf("exactly at the tolerance should still be inside it")
	}
}

func TestComputeDrift_EmptyPortfolio(t *testing.T) {
	drift := ComputeDrift([]GroupValue{{Group: Group{ID: 1, Name: "A", TargetPct: 100}}}, 5)
	if drift[0].CurrentPct != 0 || drift[0].OutsideTolerance {
		t.Errorf("an empty portfolio has no drift, got %+v", drift[0])
	}
}

func TestPlanDeposit_NotEnoughToReachTargets(t *testing.T) {
	// After 1000: total 11000, bonds need 2200 - 1000 = 1200, shares need 0. All 1000 goes to bonds.
	plan, err := PlanDeposit(groupValues(), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !near(plan[0].AmountEUR, 0) || !near(plan[1].AmountEUR, 1000) {
		t.Fatalf("amounts = %v / %v, want 0 / 1000", plan[0].AmountEUR, plan[1].AmountEUR)
	}
	if !near(plan[1].PctAfter, 2000.0/11000*100) || !near(plan[0].PctBefore, 90) {
		t.Errorf("percentages = %+v", plan)
	}
}

func TestPlanDeposit_NeedsSplitInProportion(t *testing.T) {
	// Three groups at 0 / 0 / 1000 with targets 50 / 25 / 25. After 600: total 1600, needs 800 / 400 / 0.
	// 600 < 1200, so it's split 2:1.
	groups := []GroupValue{
		{Group: Group{ID: 1, Name: "A", TargetPct: 50}},
		{Group: Group{ID: 2, Name: "B", TargetPct: 25}},
		{Group: Group{ID: 3, Name: "C", TargetPct: 25}, ValueEUR: 1000},
	}
	plan, err := PlanDeposit(groups, 600)
	if err != nil {
		t.Fatal(err)
	}
	if !near(plan[0].AmountEUR, 400) || !near(plan[1].AmountEUR, 200) || !near(plan[2].AmountEUR, 0) {
		t.Errorf("amounts = %v %v %v, want 400 200 0", plan[0].AmountEUR, plan[1].AmountEUR, plan[2].AmountEUR)
	}
}

func TestPlanDeposit_EnoughToReachTargets(t *testing.T) {
	// After 5000: total 15000, shares need 12000 - 9000 = 3000, bonds 3000 - 1000 = 2000: exactly 5000.
	plan, err := PlanDeposit(groupValues(), 5000)
	if err != nil {
		t.Fatal(err)
	}
	if !near(plan[0].AmountEUR, 3000) || !near(plan[1].AmountEUR, 2000) {
		t.Fatalf("amounts = %v / %v", plan[0].AmountEUR, plan[1].AmountEUR)
	}
	if !near(plan[0].PctAfter, 80) || !near(plan[1].PctAfter, 20) {
		t.Errorf("should land on target: %+v", plan)
	}

	// After 20000: total 30000, needs 15000 + 5000 = 20000. Any deposit large enough lands on target.
	plan, err = PlanDeposit(groupValues(), 20000)
	if err != nil {
		t.Fatal(err)
	}
	if !near(plan[0].AmountEUR+plan[1].AmountEUR, 20000) || !near(plan[0].PctAfter, 80) {
		t.Errorf("with more than needed, the result should be on target: %+v", plan)
	}
}

func TestPlanDeposit_ZeroTargetGetsNothing(t *testing.T) {
	// A group with a 0% target never gets anything.
	groups := []GroupValue{
		{Group: Group{ID: 1, Name: "A", TargetPct: 100}, ValueEUR: 100},
		{Group: Group{ID: 2, Name: "B", TargetPct: 0}, ValueEUR: 900},
	}
	plan, err := PlanDeposit(groups, 500)
	if err != nil {
		t.Fatal(err)
	}
	if !near(plan[0].AmountEUR, 500) || !near(plan[1].AmountEUR, 0) {
		t.Errorf("amounts = %+v", plan)
	}
}

func TestPlanDeposit_RejectsBadInput(t *testing.T) {
	if _, err := PlanDeposit(groupValues(), 0); !errors.Is(err, ErrInvalid) {
		t.Errorf("a zero deposit should be rejected, got %v", err)
	}
	if _, err := PlanDeposit(nil, 100); !errors.Is(err, ErrInvalid) {
		t.Errorf("no groups should be rejected, got %v", err)
	}
}

func TestSharesToBuy(t *testing.T) {
	shares, cost, left := SharesToBuy(1000, 97.5)
	if shares != 10 || !near(cost, 975) || !near(left, 25) {
		t.Errorf("1000 at 97.5 = %v shares, %v cost, %v left", shares, cost, left)
	}
	// An amount that is exactly n shares isn't rounded down to n-1 by floating point.
	if shares, _, left := SharesToBuy(0.3, 0.1); shares != 3 || !near(left, 0) {
		t.Errorf("0.3 at 0.1 = %v shares, %v left", shares, left)
	}
	if shares, _, left := SharesToBuy(50, 120); shares != 0 || !near(left, 50) {
		t.Errorf("less than one share should buy none, got %v shares, %v left", shares, left)
	}
	if shares, _, left := SharesToBuy(50, 0); shares != 0 || !near(left, 50) {
		t.Errorf("no price should buy none, got %v shares, %v left", shares, left)
	}
}

func TestAssetToBuy(t *testing.T) {
	candidates := []Candidate{
		{ISIN: "SMALL", ValueEUR: 100, PriceEUR: 10},
		{ISIN: "BIG_NO_PRICE", ValueEUR: 1000},
		{ISIN: "BIG", ValueEUR: 500, PriceEUR: 50},
	}
	if c, ok := AssetToBuy(candidates); !ok || c.ISIN != "BIG" {
		t.Errorf("should pick the largest with a price, got %v %v", c.ISIN, ok)
	}
	candidates[0].Preferred = true
	if c, _ := AssetToBuy(candidates); c.ISIN != "SMALL" {
		t.Errorf("should pick the preferred one, got %v", c.ISIN)
	}
	if _, ok := AssetToBuy(nil); ok {
		t.Errorf("an empty group has nothing to buy")
	}
}

func TestValidateGroups(t *testing.T) {
	valid := []Group{{Name: "Ações", TargetPct: 80}, {Name: "Obrigações", TargetPct: 19.995, IncludesCash: true}}
	if err := ValidateGroups(valid); err != nil {
		t.Errorf("valid groups rejected: %v", err)
	}
	cases := map[string][]Group{
		"no groups":       nil,
		"sum not 100":     {{Name: "A", TargetPct: 80}, {Name: "B", TargetPct: 10}},
		"duplicate name":  {{Name: "Ações", TargetPct: 50}, {Name: " acoes ", TargetPct: 50}},
		"empty name":      {{Name: " ", TargetPct: 100}},
		"negative target": {{Name: "A", TargetPct: 110}, {Name: "B", TargetPct: -10}},
		"two cash groups": {{Name: "A", TargetPct: 50, IncludesCash: true}, {Name: "B", TargetPct: 50, IncludesCash: true}},
	}
	for name, groups := range cases {
		if err := ValidateGroups(groups); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want a validation error, got %v", name, err)
		}
	}
}

func TestValidateAssignments(t *testing.T) {
	groups := map[int64]bool{1: true, 2: true}
	valid := []Assignment{{ISIN: "A", GroupID: 1, Preferred: true}, {ISIN: "B", GroupID: 1}, {ISIN: "C", GroupID: 2, Preferred: true}}
	if err := ValidateAssignments(valid, groups); err != nil {
		t.Errorf("valid assignments rejected: %v", err)
	}
	cases := map[string][]Assignment{
		"ISIN twice":    {{ISIN: "A", GroupID: 1}, {ISIN: "A", GroupID: 2}},
		"unknown group": {{ISIN: "A", GroupID: 3}},
		"two preferred": {{ISIN: "A", GroupID: 1, Preferred: true}, {ISIN: "B", GroupID: 1, Preferred: true}},
		"empty ISIN":    {{ISIN: "", GroupID: 1}},
	}
	for name, assignments := range cases {
		if err := ValidateAssignments(assignments, groups); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want a validation error, got %v", name, err)
		}
	}
}

func TestValidateTolerance(t *testing.T) {
	if err := ValidateTolerance(5); err != nil {
		t.Errorf("5 rejected: %v", err)
	}
	for _, v := range []float64{0, -1, 51, math.NaN()} {
		if err := ValidateTolerance(v); !errors.Is(err, ErrInvalid) {
			t.Errorf("%v should be rejected", v)
		}
	}
}

func TestSuggestAndMatchGroup(t *testing.T) {
	if SuggestGroupName(0.9) != SuggestedBondsGroup || SuggestGroupName(0.1) != SuggestedSharesGroup {
		t.Errorf("bond-heavy funds go to bonds, the rest to shares")
	}
	groups := []Group{{ID: 1, Name: "Ações Mundo"}, {ID: 2, Name: "Emergentes"}, {ID: 3, Name: "Obrigações Euro"}}
	if id, ok := MatchGroup(SuggestedBondsGroup, groups); !ok || id != 3 {
		t.Errorf("bonds matched %v %v, want 3", id, ok)
	}
	if id, ok := MatchGroup(SuggestedSharesGroup, groups); !ok || id != 1 {
		t.Errorf("shares matched %v %v, want 1", id, ok)
	}
	if _, ok := MatchGroup(SuggestedBondsGroup, []Group{{ID: 1, Name: "Ouro"}}); ok {
		t.Errorf("nothing should match bonds in a gold-only portfolio")
	}
}
