package services

import (
	"fmt"
	"math"

	"github.com/username/taxfolio/backend/src/allocation"
	"github.com/username/taxfolio/backend/src/tax"
	"github.com/username/taxfolio/backend/src/utils"
)

// RebalanceSale is one sale of the rebalancing plan, with the gain the tax simulator gives it.
type RebalanceSale struct {
	GroupID       int64   `json:"group_id"`
	GroupName     string  `json:"group_name"`
	ISIN          string  `json:"isin"`
	ProductName   string  `json:"product_name"`
	HeldQuantity  float64 `json:"held_quantity"`
	Quantity      float64 `json:"quantity"`
	PriceEUR      float64 `json:"price_eur"`
	SaleAmountEUR float64 `json:"sale_amount_eur"`
	Gain          float64 `json:"gain"`
	ShortTermGain float64 `json:"short_term_gain"`
	// MarginalTax is the extra tax of this sale made alone. The plan's TotalTaxEUR isn't the sum of these.
	MarginalTax float64 `json:"marginal_tax"`
}

// Reasons why part of a group's excess can't be sold.
const (
	UnsoldOutsideBroker = "outside_broker"  // the group's excess is in assets kept outside the brokers
	UnsoldNoPrice       = "no_price"        // a holding has no market price
	UnsoldUnderOneShare = "under_one_share" // what's left is less than one share
)

// RebalancePlanLine is what the plan does to one group.
type RebalancePlanLine struct {
	allocation.RebalanceLine
	Color        string        `json:"color"`
	IncludesCash bool          `json:"includes_cash"`
	UnsoldReason string        `json:"unsold_reason,omitempty"`
	BuyAsset     *DepositAsset `json:"buy_asset"`
	// OutsideBroker is true when the group gets money but has nothing to buy at the broker, only assets
	// outside it (named in OutsideBrokerAssets).
	OutsideBroker       bool     `json:"outside_broker,omitempty"`
	OutsideBrokerAssets []string `json:"outside_broker_assets,omitempty"`
}

// RebalancePlan is the sales that would bring every group back to its target and what they'd buy, with the
// tax the sales would add to this year. It's a simulation: nothing is sold or stored.
type RebalancePlan struct {
	Lines []RebalancePlanLine `json:"lines"`
	Sales []RebalanceSale     `json:"sales"`

	TotalBeforeEUR float64 `json:"total_before_eur"`
	TotalAfterEUR  float64 `json:"total_after_eur"`
	TotalSaleEUR   float64 `json:"total_sale_eur"`
	CashUsedEUR    float64 `json:"cash_used_eur"`
	BoughtEUR      float64 `json:"bought_eur"`
	LeftoverEUR    float64 `json:"leftover_eur"`
	// UnsoldEUR is the excess that can't be sold at the broker; ReachesTargets is false when, because of it
	// or of the whole shares, a group still ends outside the tolerance.
	UnsoldEUR      float64 `json:"unsold_eur"`
	ReachesTargets bool    `json:"reaches_targets"`

	// The tax of all the sales together, on the year's balance of shares and options: TotalTaxEUR is what
	// they add to it (negative when losses lower it). It's due the following year, so it isn't taken from
	// the money the sales raise.
	Year          int             `json:"year"`
	TotalGain     float64         `json:"total_gain"`
	ShortTermGain float64         `json:"short_term_gain"`
	YearBefore    tax.YearBalance `json:"year_before"`
	YearAfter     tax.YearBalance `json:"year_after"`
	TotalTaxEUR   float64         `json:"total_tax_eur"`
	TaxRate       float64         `json:"tax_rate"`

	TolerancePP        float64 `json:"tolerance_pp"`
	UnassignedValueEUR float64 `json:"unassigned_value_eur"`
	OtherAssetsEUR     float64 `json:"other_assets_eur"`
}

// PlanAllocationRebalance works out the sales that would bring every group of the portfolio back to its
// target, simulates them all together in the tax simulator, and says what the money raised would buy for the
// groups under target. Only broker holdings with a market price are sold; the cash of an over-target group is
// used before any sale. Nothing is stored.
func (s *uploadServiceImpl) PlanAllocationRebalance(userID, portfolioID int64) (*RebalancePlan, error) {
	status, err := s.GetAllocation(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	if !status.Configured {
		return nil, fmt.Errorf("%w: define primeiro os grupos e os alvos", ErrAllocationInput)
	}
	lotsByISIN, err := s.currentLotsByISIN(userID, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the purchase lots: %w", err)
	}

	holdingsByISIN := map[string]AllocationHolding{}
	sellable := map[int64][]allocation.SellCandidate{}
	buyable := map[int64][]allocation.Candidate{}
	withoutPrice := map[int64]bool{}
	for _, h := range status.Holdings {
		if h.GroupID == nil {
			continue
		}
		holdingsByISIN[h.ISIN] = h
		buyable[*h.GroupID] = append(buyable[*h.GroupID], allocation.Candidate{
			ISIN: h.ISIN, ValueEUR: h.ValueEUR, PriceEUR: h.PriceEUR, Preferred: h.Preferred,
		})
		if h.ValuedAtCost || h.PriceEUR <= 0 {
			withoutPrice[*h.GroupID] = true
			continue
		}
		// Only what the simulator can sell: the quantity in the purchase lots still open.
		lotQuantity := 0.0
		for _, lot := range lotsByISIN[h.ISIN] {
			lotQuantity += lot.Quantity
		}
		if quantity := math.Min(h.Quantity, lotQuantity); quantity > utils.QuantityEpsilon {
			sellable[*h.GroupID] = append(sellable[*h.GroupID], allocation.SellCandidate{ISIN: h.ISIN, Quantity: quantity, PriceEUR: h.PriceEUR})
		}
	}
	otherAssetNames := map[int64][]string{}
	for _, a := range status.OtherAssets {
		if a.GroupID != nil && a.NotCounted != "closed" {
			otherAssetNames[*a.GroupID] = append(otherAssetNames[*a.GroupID], a.Name)
		}
	}

	groups := make([]allocation.RebalanceGroup, len(status.Groups))
	for i, g := range status.Groups {
		groups[i] = allocation.RebalanceGroup{
			GroupValue: allocation.GroupValue{
				Group:    allocation.Group{ID: g.ID, Name: g.Name, TargetPct: g.TargetPct, IncludesCash: g.IncludesCash},
				ValueEUR: status.Drift[i].ValueEUR,
			},
			Sellable: sellable[g.ID],
			Buyable:  buyable[g.ID],
		}
		if g.IncludesCash {
			groups[i].CashEUR = math.Max(0, status.CashEUR)
		}
	}
	rebalance, err := allocation.PlanRebalance(groups, status.TolerancePP)
	if err != nil {
		return nil, err
	}

	plan := &RebalancePlan{
		Lines:              make([]RebalancePlanLine, len(rebalance.Lines)),
		Sales:              []RebalanceSale{},
		TotalBeforeEUR:     rebalance.TotalBeforeEUR,
		TotalAfterEUR:      rebalance.TotalAfterEUR,
		TotalSaleEUR:       rebalance.SoldEUR,
		CashUsedEUR:        rebalance.CashUsedEUR,
		BoughtEUR:          rebalance.BoughtEUR,
		LeftoverEUR:        rebalance.LeftoverEUR,
		UnsoldEUR:          rebalance.UnsoldEUR,
		ReachesTargets:     true,
		Year:               today().Year(),
		TaxRate:            tax.AutonomousRate,
		TolerancePP:        status.TolerancePP,
		UnassignedValueEUR: status.UnassignedValueEUR,
		OtherAssetsEUR:     status.OtherAssetsEUR,
	}

	var requests []SaleSimulationRequest
	var saleGroups []int // the line of each request
	for i, line := range rebalance.Lines {
		g := status.Groups[i]
		item := RebalancePlanLine{RebalanceLine: line, Color: g.Color, IncludesCash: g.IncludesCash}
		if line.UnsoldEUR > 0 {
			switch {
			case status.Drift[i].OtherAssetsEUR > 0:
				item.UnsoldReason = UnsoldOutsideBroker
			case withoutPrice[g.ID]:
				item.UnsoldReason = UnsoldNoPrice
			default:
				item.UnsoldReason = UnsoldUnderOneShare
			}
		}
		if line.BuyISIN != "" {
			h := holdingsByISIN[line.BuyISIN]
			item.BuyAsset = &DepositAsset{ISIN: h.ISIN, ProductName: h.ProductName, PriceEUR: allocRound4(h.PriceEUR)}
		} else if names := otherAssetNames[g.ID]; line.BuyAmountEUR > 0 && len(names) > 0 {
			item.OutsideBroker = true
			item.OutsideBrokerAssets = names
		}
		if line.OutsideToleranceAfter {
			plan.ReachesTargets = false
		}
		plan.Lines[i] = item
		for _, order := range line.Sales {
			// The price the plan was made with, so that the simulated amount is the planned one.
			requests = append(requests, SaleSimulationRequest{ISIN: order.ISIN, Quantity: order.Shares, PriceEUR: order.PriceEUR})
			saleGroups = append(saleGroups, i)
		}
	}

	simulation, err := s.simulateStockSales(userID, portfolioID, requests)
	if err != nil {
		return nil, fmt.Errorf("failed to simulate the sales: %w", err)
	}
	for i, sale := range simulation.Sales {
		line := rebalance.Lines[saleGroups[i]]
		name := sale.ProductName
		if h, ok := holdingsByISIN[sale.ISIN]; ok && h.ProductName != "" {
			name = h.ProductName
		}
		plan.Sales = append(plan.Sales, RebalanceSale{
			GroupID: line.GroupID, GroupName: line.Name,
			ISIN: sale.ISIN, ProductName: name,
			HeldQuantity: sale.HeldQuantity, Quantity: sale.Quantity, PriceEUR: allocRound4(sale.PriceEUR),
			SaleAmountEUR: sale.SaleAmountEUR, Gain: sale.Gain, ShortTermGain: sale.ShortTermGain, MarginalTax: sale.MarginalTax,
		})
		plan.TotalGain += sale.Gain
		plan.ShortTermGain += sale.ShortTermGain
	}
	plan.TotalGain = allocRound2(plan.TotalGain)
	plan.ShortTermGain = allocRound2(plan.ShortTermGain)
	plan.YearBefore = simulation.YearBefore
	plan.YearAfter = simulation.YearAfter
	plan.TotalTaxEUR = simulation.MarginalTax
	return plan, nil
}
