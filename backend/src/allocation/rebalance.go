package allocation

import (
	"math"
	"sort"
)

// Rebalancing by selling: the sales that bring every group back to its target, and what the money they raise
// buys for the groups under their target. The total doesn't change, so what the groups over target have in
// excess is what the others lack.
//
//   - A group over its target takes its excess out. If it holds the broker cash, the cash goes first: it needs
//     no sale and pays no tax. The rest is sold from its holdings.
//   - Only what's passed as sellable is sold: broker holdings with a market price. Assets kept outside the
//     brokers and holdings without a price count in the group's value but can't be sold here, so the part of
//     the excess they hold is reported as unsold rather than guessed.
//   - Sales are whole shares, rounded down and never more than what's held, so a group never goes below its
//     target because of a sale.
//   - The money actually raised is split among the groups under their target in proportion to what each lacks,
//     and buys whole shares of each group's asset, as a deposit does. What doesn't buy a whole share stays as
//     cash.

// SellCandidate is a holding of a group that can be sold: it has a market price and broker lots.
type SellCandidate struct {
	ISIN     string
	Quantity float64
	PriceEUR float64
}

// SellOrder is a sale of whole shares of one holding.
type SellOrder struct {
	ISIN      string  `json:"isin"`
	Shares    float64 `json:"shares"`
	PriceEUR  float64 `json:"price_eur"`
	AmountEUR float64 `json:"amount_eur"`
}

// SharesToSell picks the whole shares to sell to raise an amount from a group's holdings, without raising
// more than the amount. The amount is split among the holdings in proportion to their value, which keeps the
// group's make-up; what the rounding down leaves is then raised from the largest holdings that still have a
// whole share that fits. It returns the sales, largest first, and the part of the amount it couldn't raise.
func SharesToSell(amountEUR float64, candidates []SellCandidate) ([]SellOrder, float64) {
	if !(amountEUR > 0) {
		return nil, 0
	}
	type holding struct {
		SellCandidate
		available float64 // whole shares that can still be sold
		shares    float64
	}
	holdings := make([]holding, 0, len(candidates))
	totalValue := 0.0
	for _, c := range candidates {
		whole := math.Floor(c.Quantity + 1e-9)
		if c.PriceEUR <= 0 || whole < 1 {
			continue
		}
		holdings = append(holdings, holding{SellCandidate: c, available: whole})
		totalValue += c.Quantity * c.PriceEUR
	}
	sort.SliceStable(holdings, func(i, j int) bool {
		return holdings[i].Quantity*holdings[i].PriceEUR > holdings[j].Quantity*holdings[j].PriceEUR
	})

	remaining := amountEUR
	sell := func(h *holding, shares float64) {
		shares = math.Min(shares, h.available)
		if shares < 1 {
			return
		}
		h.shares += shares
		h.available -= shares
		remaining -= shares * h.PriceEUR
	}
	// Each holding's part of the amount, in proportion to its value.
	for i := range holdings {
		h := &holdings[i]
		part := amountEUR * (h.Quantity * h.PriceEUR) / totalValue
		sell(h, math.Floor(part/h.PriceEUR+1e-9))
	}
	// What the rounding left, from the largest holdings first.
	for i := range holdings {
		h := &holdings[i]
		sell(h, math.Floor(remaining/h.PriceEUR+1e-9))
	}

	var orders []SellOrder
	for _, h := range holdings {
		if h.shares >= 1 {
			orders = append(orders, SellOrder{ISIN: h.ISIN, Shares: h.shares, PriceEUR: h.PriceEUR, AmountEUR: round2(h.shares * h.PriceEUR)})
		}
	}
	return orders, round2(math.Max(0, remaining))
}

// RebalanceGroup is a group with what's needed to rebalance it.
type RebalanceGroup struct {
	GroupValue
	// CashEUR is the broker cash in the group, when the group includes it. It's part of ValueEUR.
	CashEUR float64
	// Sellable are the group's holdings that can be sold; Buyable those that could be bought.
	Sellable []SellCandidate
	Buyable  []Candidate
}

// RebalanceLine is what rebalancing does to one group.
type RebalanceLine struct {
	GroupID        int64   `json:"group_id"`
	Name           string  `json:"name"`
	TargetPct      float64 `json:"target_pct"`
	ValueBeforeEUR float64 `json:"value_before_eur"`
	PctBefore      float64 `json:"pct_before"`

	// ExcessEUR is how much the group is over its target; LackEUR how much it's under. One of them is zero.
	ExcessEUR float64 `json:"excess_eur"`
	LackEUR   float64 `json:"lack_eur"`

	// A group over target: the cash taken from it, the sales, and the part of the excess that can't be sold.
	CashUsedEUR float64     `json:"cash_used_eur"`
	Sales       []SellOrder `json:"sales"`
	SoldEUR     float64     `json:"sold_eur"`
	UnsoldEUR   float64     `json:"unsold_eur"`

	// A group under target: its part of the money raised, the asset bought with it (BuyISIN is empty when
	// the group has none), and what doesn't buy a whole share.
	BuyAmountEUR   float64 `json:"buy_amount_eur"`
	BuyISIN        string  `json:"buy_isin,omitempty"`
	BuyShares      float64 `json:"buy_shares"`
	BuyCostEUR     float64 `json:"buy_cost_eur"`
	BuyLeftoverEUR float64 `json:"buy_leftover_eur"`

	ValueAfterEUR         float64 `json:"value_after_eur"`
	PctAfter              float64 `json:"pct_after"`
	OutsideToleranceAfter bool    `json:"outside_tolerance_after"`
}

// Rebalance is the plan for every group, in the order given.
type Rebalance struct {
	Lines          []RebalanceLine `json:"lines"`
	TotalBeforeEUR float64         `json:"total_before_eur"`
	TotalAfterEUR  float64         `json:"total_after_eur"`
	SoldEUR        float64         `json:"sold_eur"`
	CashUsedEUR    float64         `json:"cash_used_eur"`
	BoughtEUR      float64         `json:"bought_eur"`
	// LeftoverEUR is the money raised that doesn't buy a whole share: it stays as broker cash.
	LeftoverEUR float64 `json:"leftover_eur"`
	// UnsoldEUR is the excess that couldn't be sold, so the groups don't all reach their targets.
	UnsoldEUR float64 `json:"unsold_eur"`
}

// PlanRebalance works out the sales and the purchases that bring the groups to their targets. tolerancePP
// only says, for each group, whether it ends up outside the tolerance.
func PlanRebalance(groups []RebalanceGroup, tolerancePP float64) (Rebalance, error) {
	if len(groups) == 0 {
		return Rebalance{}, invalid("define primeiro os grupos e os alvos")
	}
	total := 0.0
	for _, g := range groups {
		total += g.ValueEUR
	}
	plan := Rebalance{Lines: make([]RebalanceLine, len(groups)), TotalBeforeEUR: round2(total)}

	// The values while they change: what's sold or taken from the cash leaves, what's bought enters.
	after := make([]float64, len(groups))
	raised, totalLack := 0.0, 0.0
	lacks := make([]float64, len(groups))
	for i, g := range groups {
		line := RebalanceLine{
			GroupID: g.ID, Name: g.Name, TargetPct: g.TargetPct,
			ValueBeforeEUR: round2(g.ValueEUR), PctBefore: round2(share(g.ValueEUR, total)),
			Sales: []SellOrder{},
		}
		after[i] = g.ValueEUR
		diff := g.ValueEUR - g.TargetPct/100*total
		switch {
		case diff > 0.005:
			line.ExcessEUR = round2(diff)
			if g.IncludesCash && g.CashEUR > 0 {
				line.CashUsedEUR = round2(math.Min(diff, g.CashEUR))
			}
			orders, unsold := SharesToSell(diff-line.CashUsedEUR, g.Sellable)
			if orders != nil {
				line.Sales = orders
			}
			for _, o := range orders {
				line.SoldEUR += o.AmountEUR
			}
			line.SoldEUR = round2(line.SoldEUR)
			line.UnsoldEUR = unsold
			after[i] -= line.SoldEUR + line.CashUsedEUR
			raised += line.SoldEUR + line.CashUsedEUR
			plan.SoldEUR += line.SoldEUR
			plan.CashUsedEUR += line.CashUsedEUR
			plan.UnsoldEUR += line.UnsoldEUR
		case diff < -0.005:
			line.LackEUR = round2(-diff)
			lacks[i] = -diff
			totalLack += -diff
		}
		plan.Lines[i] = line
	}

	// The money raised goes to the groups under target, in proportion to what each lacks.
	cashGroup := -1
	for i, g := range groups {
		if g.IncludesCash {
			cashGroup = i
		}
		line := &plan.Lines[i]
		if lacks[i] <= 0 || totalLack <= 0 || raised <= 0 {
			continue
		}
		amount := math.Min(lacks[i], raised*lacks[i]/totalLack)
		line.BuyAmountEUR = round2(amount)
		line.BuyLeftoverEUR = line.BuyAmountEUR
		if c, ok := AssetToBuy(g.Buyable); ok && c.PriceEUR > 0 {
			line.BuyISIN = c.ISIN
			line.BuyShares, line.BuyCostEUR, line.BuyLeftoverEUR = SharesToBuy(amount, c.PriceEUR)
		}
		after[i] += line.BuyCostEUR
		plan.BoughtEUR += line.BuyCostEUR
		plan.LeftoverEUR += line.BuyLeftoverEUR
	}
	// What isn't spent stays as broker cash, which counts in the group that includes it, if there is one.
	if cashGroup >= 0 {
		after[cashGroup] += plan.LeftoverEUR
	}

	totalAfter := 0.0
	for _, v := range after {
		totalAfter += v
	}
	for i := range plan.Lines {
		line := &plan.Lines[i]
		line.ValueAfterEUR = round2(after[i])
		pctAfter := share(after[i], totalAfter)
		line.PctAfter = round2(pctAfter)
		line.OutsideToleranceAfter = totalAfter > 0 && math.Abs(pctAfter-line.TargetPct) > tolerancePP+1e-9
	}
	plan.TotalAfterEUR = round2(totalAfter)
	plan.SoldEUR = round2(plan.SoldEUR)
	plan.CashUsedEUR = round2(plan.CashUsedEUR)
	plan.BoughtEUR = round2(plan.BoughtEUR)
	plan.LeftoverEUR = round2(plan.LeftoverEUR)
	plan.UnsoldEUR = round2(plan.UnsoldEUR)
	return plan, nil
}
