package allocation

import (
	"errors"
	"testing"
)

func TestSharesToSell(t *testing.T) {
	x := SellCandidate{ISIN: "X", Quantity: 30, PriceEUR: 100}
	bond := SellCandidate{ISIN: "BOND", Quantity: 20, PriceEUR: 50}

	cases := []struct {
		name       string
		amount     float64
		candidates []SellCandidate
		want       map[string]float64 // shares per ISIN
		unsold     float64
	}{
		{"exactly whole shares", 600, []SellCandidate{x}, map[string]float64{"X": 6}, 0},
		{"rounds down, never past the amount", 650, []SellCandidate{x}, map[string]float64{"X": 6}, 50},
		{"split by value", 800, []SellCandidate{x, bond}, map[string]float64{"X": 6, "BOND": 4}, 0},
		{"never more than held", 5000, []SellCandidate{x}, map[string]float64{"X": 30}, 2000},
		{"only whole shares of a fractional holding", 1000, []SellCandidate{{ISIN: "F", Quantity: 2.5, PriceEUR: 100}}, map[string]float64{"F": 2}, 800},
		{"nothing sellable", 500, nil, map[string]float64{}, 500},
		{"a holding without a price is skipped", 500, []SellCandidate{{ISIN: "N", Quantity: 10}}, map[string]float64{}, 500},
		{"less than one share", 40, []SellCandidate{x, bond}, map[string]float64{}, 40},
		{"nothing to raise", 0, []SellCandidate{x}, map[string]float64{}, 0},
		// 250 split by value is 192 of A (1 share) and 58 of B (1 share); the 120 left take one more A.
		{"what the rounding leaves comes from the largest", 250,
			[]SellCandidate{{ISIN: "A", Quantity: 10, PriceEUR: 100}, {ISIN: "B", Quantity: 10, PriceEUR: 30}},
			map[string]float64{"A": 2, "B": 1}, 20},
	}
	for _, c := range cases {
		orders, unsold := SharesToSell(c.amount, c.candidates)
		got := map[string]float64{}
		raised := 0.0
		for _, o := range orders {
			got[o.ISIN] = o.Shares
			raised += o.AmountEUR
			if o.AmountEUR != round2(o.Shares*o.PriceEUR) {
				t.Errorf("%s: %s amount %v isn't shares × price", c.name, o.ISIN, o.AmountEUR)
			}
		}
		if len(got) != len(c.want) {
			t.Errorf("%s: sold %v, want %v", c.name, got, c.want)
		}
		for isin, shares := range c.want {
			if got[isin] != shares {
				t.Errorf("%s: sold %v of %s, want %v", c.name, got[isin], isin, shares)
			}
		}
		if unsold != c.unsold {
			t.Errorf("%s: unsold %v, want %v", c.name, unsold, c.unsold)
		}
		if raised > c.amount+0.005 {
			t.Errorf("%s: raised %v, more than the %v asked", c.name, raised, c.amount)
		}
	}
}

func rebalanceGroup(id int64, name string, target, value float64) RebalanceGroup {
	return RebalanceGroup{GroupValue: GroupValue{Group: Group{ID: id, Name: name, TargetPct: target}, ValueEUR: value}}
}

func TestPlanRebalance_SellsTheExcessAndBuysWhatLacks(t *testing.T) {
	shares := rebalanceGroup(1, "Ações", 60, 3000)
	shares.Sellable = []SellCandidate{{ISIN: "X", Quantity: 30, PriceEUR: 100}}
	shares.Buyable = []Candidate{{ISIN: "X", ValueEUR: 3000, PriceEUR: 100}}
	bonds := rebalanceGroup(2, "Obrigações", 40, 1000)
	bonds.Sellable = []SellCandidate{{ISIN: "BOND", Quantity: 20, PriceEUR: 50}}
	bonds.Buyable = []Candidate{{ISIN: "BOND", ValueEUR: 1000, PriceEUR: 50}}

	plan, err := PlanRebalance([]RebalanceGroup{shares, bonds}, 5)
	if err != nil {
		t.Fatal(err)
	}
	// 75% / 25% against 60% / 40%: 600 of shares become bonds.
	sell, buy := plan.Lines[0], plan.Lines[1]
	if sell.ExcessEUR != 600 || len(sell.Sales) != 1 || sell.Sales[0].Shares != 6 || sell.SoldEUR != 600 || sell.UnsoldEUR != 0 || sell.BuyAmountEUR != 0 {
		t.Errorf("selling line = %+v", sell)
	}
	if buy.LackEUR != 600 || buy.BuyAmountEUR != 600 || buy.BuyISIN != "BOND" || buy.BuyShares != 12 || buy.BuyCostEUR != 600 || len(buy.Sales) != 0 {
		t.Errorf("buying line = %+v", buy)
	}
	if sell.PctAfter != 60 || buy.PctAfter != 40 || sell.OutsideToleranceAfter || buy.OutsideToleranceAfter {
		t.Errorf("after: %+v and %+v", sell, buy)
	}
	if plan.SoldEUR != 600 || plan.BoughtEUR != 600 || plan.LeftoverEUR != 0 || plan.UnsoldEUR != 0 || plan.TotalBeforeEUR != 4000 || plan.TotalAfterEUR != 4000 {
		t.Errorf("plan = %+v", plan)
	}

	// Already on target: nothing to do.
	plan, _ = PlanRebalance([]RebalanceGroup{rebalanceGroup(1, "A", 75, 3000), rebalanceGroup(2, "B", 25, 1000)}, 5)
	if plan.SoldEUR != 0 || plan.BoughtEUR != 0 || len(plan.Lines[0].Sales) != 0 || plan.Lines[0].ExcessEUR != 0 || plan.Lines[1].LackEUR != 0 {
		t.Errorf("a portfolio on target needs no sale: %+v", plan)
	}

	if _, err := PlanRebalance(nil, 5); !errors.Is(err, ErrInvalid) {
		t.Errorf("no groups should be invalid input, got %v", err)
	}
}

func TestPlanRebalance_UsesTheCashBeforeSelling(t *testing.T) {
	// 3000 of cash against a 10% target: the excess comes from the cash, with no sale.
	cash := rebalanceGroup(1, "Liquidez", 10, 3000)
	cash.IncludesCash = true
	cash.CashEUR = 3000
	rest := rebalanceGroup(2, "Tudo", 90, 1000)
	rest.Buyable = []Candidate{{ISIN: "X", ValueEUR: 1000, PriceEUR: 100}}

	plan, err := PlanRebalance([]RebalanceGroup{cash, rest}, 5)
	if err != nil {
		t.Fatal(err)
	}
	if line := plan.Lines[0]; line.ExcessEUR != 2600 || line.CashUsedEUR != 2600 || len(line.Sales) != 0 || line.UnsoldEUR != 0 {
		t.Errorf("cash line = %+v", line)
	}
	if line := plan.Lines[1]; line.BuyShares != 26 || line.BuyCostEUR != 2600 || line.PctAfter != 90 {
		t.Errorf("buying line = %+v", line)
	}
	if plan.SoldEUR != 0 || plan.CashUsedEUR != 2600 {
		t.Errorf("plan = %+v", plan)
	}
}

func TestPlanRebalance_MoneyForACashGroupStaysAsCash(t *testing.T) {
	// 4000 in holdings (70%) and 1400 of cash (30%): 220 over target.
	all := rebalanceGroup(1, "Tudo", 70, 4000)
	all.Sellable = []SellCandidate{{ISIN: "X", Quantity: 30, PriceEUR: 100}, {ISIN: "BOND", Quantity: 20, PriceEUR: 50}}
	cash := rebalanceGroup(2, "Liquidez", 30, 1400)
	cash.IncludesCash = true
	cash.CashEUR = 1400

	plan, err := PlanRebalance([]RebalanceGroup{all, cash}, 5)
	if err != nil {
		t.Fatal(err)
	}
	// 220 split by value is 165 of X (1 share) and 55 of BOND (1 share); the 70 left take one more BOND.
	sell := plan.Lines[0]
	if sell.SoldEUR != 200 || sell.UnsoldEUR != 20 || len(sell.Sales) != 2 {
		t.Errorf("selling line = %+v", sell)
	}
	// The cash group has nothing to buy: the 200 stay as cash, in the group.
	line := plan.Lines[1]
	if line.BuyAmountEUR != 200 || line.BuyISIN != "" || line.BuyLeftoverEUR != 200 || line.ValueAfterEUR != 1600 {
		t.Errorf("cash line = %+v", line)
	}
	if plan.LeftoverEUR != 200 || plan.TotalAfterEUR != 5400 {
		t.Errorf("plan = %+v", plan)
	}
}

func TestPlanRebalance_ReportsWhatCannotBeSold(t *testing.T) {
	// The group is over target because of 5000 kept outside the broker; only its 1000 of BOND can be sold.
	safe := rebalanceGroup(1, "Seguro", 20, 6000)
	safe.Sellable = []SellCandidate{{ISIN: "BOND", Quantity: 20, PriceEUR: 50}}
	shares := rebalanceGroup(2, "Ações", 80, 4000)
	shares.Buyable = []Candidate{{ISIN: "X", ValueEUR: 4000, PriceEUR: 100}}

	plan, err := PlanRebalance([]RebalanceGroup{safe, shares}, 5)
	if err != nil {
		t.Fatal(err)
	}
	// Target 2000, so 4000 over: 1000 sold, 3000 that can't be.
	if line := plan.Lines[0]; line.ExcessEUR != 4000 || line.SoldEUR != 1000 || line.UnsoldEUR != 3000 || !line.OutsideToleranceAfter {
		t.Errorf("selling line = %+v", line)
	}
	if line := plan.Lines[1]; line.BuyAmountEUR != 1000 || line.BuyShares != 10 || line.PctAfter != 50 {
		t.Errorf("buying line = %+v", line)
	}
	if plan.UnsoldEUR != 3000 {
		t.Errorf("plan = %+v", plan)
	}

	// The money raised that doesn't buy a whole share leaves the total when no group holds the cash.
	a := rebalanceGroup(1, "A", 50, 1090)
	a.Sellable = []SellCandidate{{ISIN: "A", Quantity: 109, PriceEUR: 10}}
	b := rebalanceGroup(2, "B", 50, 910)
	b.Buyable = []Candidate{{ISIN: "B", ValueEUR: 910, PriceEUR: 70}}
	plan, _ = PlanRebalance([]RebalanceGroup{a, b}, 5)
	// 90 over: 9 shares of A sold; 90 buy one B at 70, 20 left as cash outside the groups.
	if plan.SoldEUR != 90 || plan.BoughtEUR != 70 || plan.LeftoverEUR != 20 || plan.TotalAfterEUR != 1980 {
		t.Errorf("plan = %+v", plan)
	}
}
