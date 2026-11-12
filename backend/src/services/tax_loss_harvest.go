package services

import (
	"fmt"
	"sort"

	"github.com/username/taxfolio/backend/src/tax"
	"github.com/username/taxfolio/backend/src/utils"
)

// HarvestSkipped is a position the loss harvest couldn't use, and why: "no_price" (no current price, so its
// result today is unknown) or "below_commission" (its tax saving isn't more than the commission of the sale).
type HarvestSkipped struct {
	ISIN        string `json:"isin"`
	ProductName string `json:"product_name"`
	Reason      string `json:"reason"`
}

// TaxLossHarvestPlan is a set of sales of positions at a loss that would lower this year's tax, worked out
// on the same FIFO as the real sales. Nothing is stored.
type TaxLossHarvestPlan struct {
	Year       int     `json:"year"`
	TaxRate    float64 `json:"tax_rate"`
	Commission float64 `json:"commission"` // Commission assumed for each sale
	// Sales has each sale. Its YearAfter and MarginalTax are those of that sale alone.
	Sales      []SaleSimulation `json:"sales"`
	YearBefore tax.YearBalance  `json:"year_before"`
	YearAfter  tax.YearBalance  `json:"year_after"` // With all the sales together
	TaxSaved   float64          `json:"tax_saved"`  // How much lower this year's tax is with all the sales
	TotalSale  float64          `json:"total_sale_eur"`
	TotalLoss  float64          `json:"total_loss_eur"`
	// UnusedLoss is the loss the positions could still give beyond what brings the balance to zero, which
	// would change nothing this year (≤ 0).
	UnusedLoss float64          `json:"unused_loss_eur"`
	Skipped    []HarvestSkipped `json:"skipped"`
	Deadline   string           `json:"deadline"` // Last day of the year, DD-MM-YYYY
}

// PlanTaxLossHarvest works out which positions held at a loss could be sold today, and how many shares of
// each, to lower this year's capital gains tax as much as possible without selling more than needed. The
// rules are in tax.PlanLossHarvest. Each lot's result comes from one simulated sale of every position
// (so it counts the commissions of the purchases the same way as the real sales), and the sales chosen
// are simulated together again to give the figures returned.
func (s *uploadServiceImpl) PlanTaxLossHarvest(userID, portfolioID int64, commission float64) (*TaxLossHarvestPlan, error) {
	if commission < 0 {
		return nil, fmt.Errorf("%w: a comissão não pode ser negativa", ErrSimulationInput)
	}
	lotsByISIN, err := s.currentLotsByISIN(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	prices, err := s.currentPrices(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	now := today()
	plan := &TaxLossHarvestPlan{
		Year:       now.Year(),
		TaxRate:    tax.AutonomousRate,
		Commission: commission,
		Sales:      []SaleSimulation{},
		Skipped:    []HarvestSkipped{},
		Deadline:   fmt.Sprintf("31-12-%d", now.Year()),
	}

	names := map[string]string{}
	priceOf := map[string]float64{}
	var everything []SaleSimulationRequest
	for isin, lots := range lotsByISIN {
		held := 0.0
		for _, lot := range lots {
			held += lot.Quantity
		}
		if isin == "" || held <= utils.QuantityEpsilon {
			continue
		}
		names[isin] = lots[0].ProductName
		h := prices[isin]
		if h.ProductName != "" {
			names[isin] = h.ProductName
		}
		if h.CurrentPriceEUR <= 0 {
			plan.Skipped = append(plan.Skipped, HarvestSkipped{isin, names[isin], "no_price"})
			continue
		}
		priceOf[isin] = h.CurrentPriceEUR
		everything = append(everything, SaleSimulationRequest{ISIN: isin, Quantity: held, PriceEUR: h.CurrentPriceEUR})
	}
	sort.Slice(everything, func(i, j int) bool { return everything[i].ISIN < everything[j].ISIN })

	// Selling everything today gives each lot's result, with its share of the purchase commission.
	all, err := s.simulateStockSales(userID, portfolioID, everything)
	if err != nil {
		return nil, err
	}
	plan.YearBefore, plan.YearAfter = all.YearBefore, all.YearBefore

	positions := make([]tax.HarvestPosition, 0, len(all.Sales))
	for _, sale := range all.Sales {
		position := tax.HarvestPosition{ISIN: sale.ISIN}
		for _, lot := range sale.Lots {
			position.Lots = append(position.Lots, tax.HarvestLot{Quantity: lot.Quantity, Gain: lot.Gain, Value: lot.SaleAmountEUR})
		}
		positions = append(positions, position)
	}
	chosen := tax.PlanLossHarvest(plan.YearBefore.Balance, positions, commission)
	for _, isin := range chosen.BelowCommission {
		plan.Skipped = append(plan.Skipped, HarvestSkipped{isin, names[isin], "below_commission"})
	}
	plan.UnusedLoss = chosen.UnusedLoss
	if len(chosen.Picks) == 0 {
		return plan, nil
	}

	requests := make([]SaleSimulationRequest, len(chosen.Picks))
	for i, pick := range chosen.Picks {
		requests[i] = SaleSimulationRequest{ISIN: pick.ISIN, Quantity: pick.Quantity, PriceEUR: priceOf[pick.ISIN], Commission: commission}
	}
	result, err := s.simulateStockSales(userID, portfolioID, requests)
	if err != nil {
		return nil, err
	}
	// The figures are those of this second run: the same prices, plus the commission of each sale.
	for _, sale := range result.Sales {
		sale.UsedCurrent = true
		plan.Sales = append(plan.Sales, sale)
		plan.TotalSale += sale.SaleAmountEUR
		plan.TotalLoss += sale.Gain
	}
	plan.YearAfter = result.YearAfter
	plan.TaxSaved = utils.RoundFloat(-result.MarginalTax, 2)
	plan.TotalSale = utils.RoundFloat(plan.TotalSale, 2)
	plan.TotalLoss = utils.RoundFloat(plan.TotalLoss, 2)
	return plan, nil
}
