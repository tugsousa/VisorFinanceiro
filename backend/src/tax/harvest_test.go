package tax

import (
	"reflect"
	"testing"
)

func TestPlanLossHarvest_StopsAtTheLowestFIFOPrefix(t *testing.T) {
	// The real case: the first two lots are at a loss, the third is a small loss only after the commission
	// of its purchase, and the last two are at a gain. Selling the first three lots gives the most loss.
	alibaba := HarvestPosition{ISIN: "BABA", Lots: []HarvestLot{
		{Quantity: 40, Gain: -862.40, Value: 3657.16},
		{Quantity: 10, Gain: -162.11, Value: 914.29},
		{Quantity: 8, Gain: -3.77, Value: 731.43},
		{Quantity: 15, Gain: 273.53, Value: 1371.43},
		{Quantity: 37, Gain: 381.47, Value: 3382.87},
	}}
	em := HarvestPosition{ISIN: "EM", Lots: []HarvestLot{{Quantity: 209, Gain: -493.80, Value: 9448.91}}}
	winner := HarvestPosition{ISIN: "WIN", Lots: []HarvestLot{{Quantity: 10, Gain: 500, Value: 2000}}}

	plan := PlanLossHarvest(7737.53, []HarvestPosition{em, winner, alibaba}, 0)

	want := []HarvestPick{
		{ISIN: "BABA", Quantity: 58, Gain: -1028.28, Value: 5302.88},
		{ISIN: "EM", Quantity: 209, Gain: -493.80, Value: 9448.91},
	}
	if !reflect.DeepEqual(plan.Picks, want) {
		t.Errorf("picks = %+v, want %+v", plan.Picks, want)
	}
	if plan.UnusedLoss != 0 {
		t.Errorf("unused loss = %v, want 0", plan.UnusedLoss)
	}
}

func TestPlanLossHarvest_KeepsFewerLotsOnATie(t *testing.T) {
	p := HarvestPosition{ISIN: "X", Lots: []HarvestLot{
		{Quantity: 5, Gain: -100, Value: 400},
		{Quantity: 5, Gain: 0, Value: 500},
	}}
	plan := PlanLossHarvest(1000, []HarvestPosition{p}, 0)
	if len(plan.Picks) != 1 || plan.Picks[0].Quantity != 5 {
		t.Errorf("picks = %+v, want 5 shares", plan.Picks)
	}
}

func TestPlanLossHarvest_DoesNotSellMoreThanTheBalanceNeeds(t *testing.T) {
	// A balance of 150: A gives the most loss per euro (300 on 1000) and is cut to the shares that cover
	// 150 (5 of 10, rounded up to whole shares); B isn't needed.
	a := HarvestPosition{ISIN: "A", Lots: []HarvestLot{{Quantity: 10, Gain: -300, Value: 1000}}}
	b := HarvestPosition{ISIN: "B", Lots: []HarvestLot{{Quantity: 10, Gain: -100, Value: 1000}}}

	plan := PlanLossHarvest(150, []HarvestPosition{b, a}, 0)

	want := []HarvestPick{{ISIN: "A", Quantity: 5, Gain: -150, Value: 500}}
	if !reflect.DeepEqual(plan.Picks, want) {
		t.Errorf("picks = %+v, want %+v", plan.Picks, want)
	}
	if plan.UnusedLoss != -250 {
		t.Errorf("unused loss = %v, want -250 (150 of A and 100 of B)", plan.UnusedLoss)
	}
}

func TestPlanLossHarvest_CutsInsideTheLotThatCrossesTheBalance(t *testing.T) {
	// The first lot gives 40, so 60 more come from the second lot: 6 of its 20 shares (−10 each).
	p := HarvestPosition{ISIN: "X", Lots: []HarvestLot{
		{Quantity: 4, Gain: -40, Value: 100},
		{Quantity: 20, Gain: -200, Value: 500},
	}}
	plan := PlanLossHarvest(100, []HarvestPosition{p}, 0)
	want := []HarvestPick{{ISIN: "X", Quantity: 10, Gain: -100, Value: 250}}
	if !reflect.DeepEqual(plan.Picks, want) {
		t.Errorf("picks = %+v, want %+v", plan.Picks, want)
	}
}

func TestPlanLossHarvest_NothingWithoutTaxToSave(t *testing.T) {
	p := HarvestPosition{ISIN: "X", Lots: []HarvestLot{{Quantity: 1, Gain: -100, Value: 10}}}
	for _, balance := range []float64{0, -50} {
		if plan := PlanLossHarvest(balance, []HarvestPosition{p}, 0); len(plan.Picks) != 0 {
			t.Errorf("balance %v: picks = %+v, want none", balance, plan.Picks)
		}
	}
	gain := HarvestPosition{ISIN: "G", Lots: []HarvestLot{{Quantity: 1, Gain: 10, Value: 10}}}
	if plan := PlanLossHarvest(500, []HarvestPosition{gain}, 0); len(plan.Picks) != 0 {
		t.Errorf("only gains: picks = %+v, want none", plan.Picks)
	}
}

func TestPlanLossHarvest_LeavesOutLossesThatDontPayTheCommission(t *testing.T) {
	// A loss of 10 saves 2,80 of tax: less than a commission of 5.
	small := HarvestPosition{ISIN: "S", Lots: []HarvestLot{{Quantity: 1, Gain: -10, Value: 90}}}
	big := HarvestPosition{ISIN: "B", Lots: []HarvestLot{{Quantity: 1, Gain: -100, Value: 900}}}
	plan := PlanLossHarvest(1000, []HarvestPosition{small, big}, 5)
	if len(plan.Picks) != 1 || plan.Picks[0].ISIN != "B" {
		t.Errorf("picks = %+v, want only B", plan.Picks)
	}
	if !reflect.DeepEqual(plan.BelowCommission, []string{"S"}) {
		t.Errorf("below commission = %v, want [S]", plan.BelowCommission)
	}
}
