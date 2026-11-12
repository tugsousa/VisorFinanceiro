package tax

import (
	"math"
	"sort"

	"github.com/username/taxfolio/backend/src/utils"
)

// Loss harvesting: which positions held at a loss could be sold this year to lower the year's tax.
//
// The rules:
//   - Only a positive balance pays tax, and losses aren't carried to later years, so losses only help up to
//     the year's balance: selling more realises losses that change nothing.
//   - Shares are sold oldest lot first (FIFO), so for each position the only choice is how many shares to
//     sell, and the result is the sum of the first lots. The best loss of a position is the lowest of those
//     sums. Inside a lot the gain grows in proportion to the shares, so that lowest sum is always at the end
//     of a lot: it never pays to stop in the middle of one.
//   - When the losses are more than the balance, the positions that give the most loss per euro sold go
//     first, and the last one is cut to the shares that bring the balance to zero.
//   - A position whose tax saving isn't more than the commission of its sale is left out.

// HarvestLot is one FIFO lot of a position held, with what selling it today would give.
type HarvestLot struct {
	Quantity float64
	Gain     float64 // Taxable gain if sold today, after the commissions of the part of the purchase
	Value    float64 // Sale amount at today's price
}

// HarvestPosition is a position held, with its lots in FIFO order (oldest first).
type HarvestPosition struct {
	ISIN string
	Lots []HarvestLot
}

// HarvestPick is how much of a position to sell, with the gain and the sale amount that gives.
type HarvestPick struct {
	ISIN     string
	Quantity float64
	Gain     float64
	Value    float64
}

// HarvestPlan is the result of PlanLossHarvest.
type HarvestPlan struct {
	Picks []HarvestPick
	// BelowCommission has the ISINs whose best loss saves no more tax than the commission of the sale.
	BelowCommission []string
	// UnusedLoss is the loss the positions could still give beyond what brings the balance to zero (≤ 0).
	UnusedLoss float64
}

// bestPrefix returns how many of the first lots give the lowest total gain, with that gain and value.
// On a tie it keeps the fewer lots. It returns 0 lots when no prefix is at a loss.
func bestPrefix(lots []HarvestLot) (count int, quantity, gain, value float64) {
	var q, g, v float64
	for i, lot := range lots {
		q += lot.Quantity
		g += lot.Gain
		v += lot.Value
		if g < gain-0.005 {
			count, quantity, gain, value = i+1, q, g, v
		}
	}
	return count, quantity, gain, value
}

// sharesFor returns how many of the first shares of a position give a loss of at least `loss` (> 0), looking
// only at its first `count` lots. A cut inside a lot is rounded up to whole shares, or to 4 decimals when the
// lot has a fraction of a share.
func sharesFor(lots []HarvestLot, count int, loss float64) HarvestPick {
	var pick HarvestPick
	for _, lot := range lots[:count] {
		if lot.Gain < 0 && pick.Gain+lot.Gain <= -loss {
			fraction := (-loss - pick.Gain) / lot.Gain
			shares := fraction * lot.Quantity
			if lot.Quantity == math.Trunc(lot.Quantity) {
				shares = math.Ceil(shares - 1e-9)
			} else {
				shares = math.Ceil(shares*1e4-1e-6) / 1e4
			}
			shares = math.Min(shares, lot.Quantity)
			part := shares / lot.Quantity
			pick.Quantity += shares
			pick.Gain += lot.Gain * part
			pick.Value += lot.Value * part
			return pick
		}
		pick.Quantity += lot.Quantity
		pick.Gain += lot.Gain
		pick.Value += lot.Value
	}
	return pick
}

// PlanLossHarvest picks the sales of positions at a loss that lower the tax of a year whose balance so far
// is `balance`, without selling more than needed to bring the balance to zero. `commission` is the
// expected commission of each sale. The picks come out in the order they were chosen.
func PlanLossHarvest(balance float64, positions []HarvestPosition, commission float64) HarvestPlan {
	plan := HarvestPlan{Picks: []HarvestPick{}, BelowCommission: []string{}}
	if balance <= 0 {
		return plan
	}

	type candidate struct {
		position HarvestPosition
		count    int
		best     HarvestPick
	}
	var candidates []candidate
	for _, p := range positions {
		count, quantity, gain, value := bestPrefix(p.Lots)
		if count == 0 {
			continue
		}
		if -gain*AutonomousRate <= commission {
			plan.BelowCommission = append(plan.BelowCommission, p.ISIN)
			continue
		}
		candidates = append(candidates, candidate{p, count, HarvestPick{p.ISIN, quantity, gain, value}})
	}
	// The most loss per euro sold first; the ISIN breaks ties so the plan doesn't change between calls.
	sort.Slice(candidates, func(i, j int) bool {
		a, b := candidates[i].best, candidates[j].best
		ra, rb := -a.Gain/math.Max(a.Value, 0.01), -b.Gain/math.Max(b.Value, 0.01)
		if math.Abs(ra-rb) > 1e-9 {
			return ra > rb
		}
		return a.ISIN < b.ISIN
	})

	remaining := balance
	for _, c := range candidates {
		if remaining <= 0.005 {
			plan.UnusedLoss += c.best.Gain
			continue
		}
		pick := c.best
		if -pick.Gain > remaining {
			if remaining*AutonomousRate <= commission {
				plan.UnusedLoss += pick.Gain
				continue
			}
			plan.UnusedLoss += pick.Gain + remaining
			pick = sharesFor(c.position.Lots, c.count, remaining)
			pick.ISIN = c.position.ISIN
		}
		remaining += pick.Gain
		pick.Quantity = utils.RoundQuantity(pick.Quantity)
		pick.Gain = utils.RoundFloat(pick.Gain, 2)
		pick.Value = utils.RoundFloat(pick.Value, 2)
		plan.Picks = append(plan.Picks, pick)
	}
	plan.UnusedLoss = utils.RoundFloat(plan.UnusedLoss, 2)
	return plan
}
