package networth

import (
	"math"
	"sort"
	"time"
)

// Portfolio is a broker portfolio valued now: its holdings at market price (at cost where there's no
// price, as on the dashboard) and its cash.
type Portfolio struct {
	ID          int64
	Name        string
	HoldingsEUR float64
	CashEUR     float64
}

// Snapshot is a portfolio's value (holdings and cash) at the end of a day, from portfolio_snapshots.
type Snapshot struct {
	PortfolioID int64
	Date        time.Time
	ValueEUR    float64
}

// TypeTotal is the value of one asset type, or of the broker portfolios (TypeBrokers).
type TypeTotal struct {
	Type      string  `json:"type"`
	ValueEUR  float64 `json:"value_eur"`
	WeightPct float64 `json:"weight_pct"`
}

// HistoryPoint is the net worth at the end of a month; the last point is today.
type HistoryPoint struct {
	Date           string  `json:"date"` // YYYY-MM-DD
	PortfoliosEUR  float64 `json:"portfolios_eur"`
	OtherAssetsEUR float64 `json:"other_assets_eur"`
	TotalEUR       float64 `json:"total_eur"`
}

// Summary is the total net worth.
type Summary struct {
	TotalEUR       float64
	PortfoliosEUR  float64
	OtherAssetsEUR float64
	// MonthChangeEUR is the change since the end of last month, deposits and withdrawals included; nil when
	// there's no value at the end of last month.
	MonthChangeEUR *float64
	ByType         []TypeTotal
	History        []HistoryPoint
	// AssetValues is the value of each asset today, by asset ID.
	AssetValues map[int64]Value
}

// typeOrder is the order of the types in the totals.
var typeOrder = []string{TypeBrokers, TypeCashAccount, TypeTermDeposit, TypeSavingsCertificate, TypePPR, TypeCrypto, TypeRealEstate, TypeOther}

// Summarize adds up the broker portfolios valued now and the other assets valued today, and builds the monthly
// history: the portfolios from their snapshots (the last one on or before each month's end) and the other
// assets from their entries or formula. The other assets are kept apart from the portfolios, so they never
// change a portfolio's own figures.
func Summarize(portfolios []Portfolio, assets []Asset, snapshots []Snapshot, today time.Time) Summary {
	today = dayOf(today)
	summary := Summary{AssetValues: make(map[int64]Value, len(assets))}

	byType := map[string]float64{}
	for _, p := range portfolios {
		summary.PortfoliosEUR += p.HoldingsEUR + p.CashEUR
	}
	byType[TypeBrokers] = summary.PortfoliosEUR
	for _, a := range assets {
		v := a.ValueOn(today)
		summary.AssetValues[a.ID] = v
		summary.OtherAssetsEUR += v.Net
		byType[a.Type] += v.Net
	}
	summary.TotalEUR = summary.PortfoliosEUR + summary.OtherAssetsEUR

	for _, t := range typeOrder {
		value, ok := byType[t]
		if !ok || (math.Abs(value) < 0.005 && t != TypeBrokers) {
			continue
		}
		summary.ByType = append(summary.ByType, TypeTotal{Type: t, ValueEUR: round2(value), WeightPct: percent(value, summary.TotalEUR)})
	}

	summary.History = monthlyHistory(assets, snapshots, today)
	summary.History = append(summary.History, HistoryPoint{
		Date:           today.Format(DateLayout),
		PortfoliosEUR:  round2(summary.PortfoliosEUR),
		OtherAssetsEUR: round2(summary.OtherAssetsEUR),
		TotalEUR:       round2(summary.TotalEUR),
	})
	if n := len(summary.History); n >= 2 {
		previous := summary.History[n-2]
		if previous.Date == lastDayOfPreviousMonth(today).Format(DateLayout) {
			change := round2(summary.TotalEUR - previous.TotalEUR)
			summary.MonthChangeEUR = &change
		}
	}

	summary.PortfoliosEUR = round2(summary.PortfoliosEUR)
	summary.OtherAssetsEUR = round2(summary.OtherAssetsEUR)
	summary.TotalEUR = round2(summary.TotalEUR)
	return summary
}

// monthlyHistory has one point per month end, from the month of the first snapshot or asset value to last
// month. The current month is the live point Summarize adds.
func monthlyHistory(assets []Asset, snapshots []Snapshot, today time.Time) []HistoryPoint {
	var first time.Time
	consider := func(t time.Time) {
		if first.IsZero() || t.Before(first) {
			first = t
		}
	}
	for _, s := range snapshots {
		consider(dayOf(s.Date))
	}
	for _, a := range assets {
		if d, ok := a.firstDate(); ok {
			consider(d)
		}
	}
	if first.IsZero() {
		return nil
	}

	byPortfolio := map[int64][]Snapshot{}
	for _, s := range snapshots {
		byPortfolio[s.PortfolioID] = append(byPortfolio[s.PortfolioID], s)
	}
	for id := range byPortfolio {
		list := byPortfolio[id]
		sort.Slice(list, func(i, j int) bool { return list[i].Date.Before(list[j].Date) })
	}
	next := map[int64]int{}          // index of the first snapshot not yet passed, per portfolio
	lastValue := map[int64]float64{} // value of the last snapshot passed, per portfolio

	var points []HistoryPoint
	lastMonthEnd := lastDayOfPreviousMonth(today)
	for monthEnd := lastDayOfMonth(first); !monthEnd.After(lastMonthEnd); monthEnd = lastDayOfMonth(monthEnd.AddDate(0, 0, 1)) {
		portfolios := 0.0
		for id, list := range byPortfolio {
			i := next[id]
			for i < len(list) && !dayOf(list[i].Date).After(monthEnd) {
				lastValue[id] = list[i].ValueEUR
				i++
			}
			next[id] = i
			portfolios += lastValue[id]
		}
		others := 0.0
		for _, a := range assets {
			others += a.ValueOn(monthEnd).Net
		}
		points = append(points, HistoryPoint{
			Date:           monthEnd.Format(DateLayout),
			PortfoliosEUR:  round2(portfolios),
			OtherAssetsEUR: round2(others),
			TotalEUR:       round2(portfolios + others),
		})
	}
	return points
}

func lastDayOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC)
}

func lastDayOfPreviousMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 0, 0, 0, 0, 0, time.UTC)
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func percent(part, whole float64) float64 {
	if whole == 0 {
		return 0
	}
	return round2(part / whole * 100)
}
