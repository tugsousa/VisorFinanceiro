package services

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/username/taxfolio/backend/src/allocation"
	"github.com/username/taxfolio/backend/src/database"
)

// ErrAllocationInput is returned when the groups, assignments, settings or deposit sent are invalid.
var ErrAllocationInput = allocation.ErrInvalid

// ErrAllocationPortfolioNotFound is returned when the portfolio doesn't exist or belongs to another user.
var ErrAllocationPortfolioNotFound = errors.New("portfolio not found")

// AllocationGroup is a group of holdings with its target share of the portfolio, in %.
type AllocationGroup struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	TargetPct    float64 `json:"target_pct"`
	Color        string  `json:"color"`
	SortOrder    int     `json:"sort_order"`
	IncludesCash bool    `json:"includes_cash"`
}

// AllocationAssignment puts a holding in a group; Preferred marks the asset to buy for the group.
type AllocationAssignment struct {
	ISIN      string `json:"isin"`
	GroupID   int64  `json:"group_id"`
	Preferred bool   `json:"preferred"`
}

// AllocationSettings are the allocation settings of a portfolio.
type AllocationSettings struct {
	TolerancePP float64 `json:"tolerance_pp"`
}

// AllocationHolding is a current holding with its value and group.
type AllocationHolding struct {
	ISIN        string  `json:"isin"`
	ProductName string  `json:"product_name"`
	AssetType   string  `json:"asset_type,omitempty"`
	Quantity    float64 `json:"quantity"`
	PriceEUR    float64 `json:"price_eur"`
	ValueEUR    float64 `json:"value_eur"`
	PriceStatus string  `json:"price_status"`
	// ValuedAtCost is true when there's no market price, so the holding counts at its cost.
	ValuedAtCost bool    `json:"valued_at_cost"`
	BondSharePct float64 `json:"bond_share_pct,omitempty"`
	GroupID      *int64  `json:"group_id"`
	Preferred    bool    `json:"preferred"`
	// SuggestedGroup is "Ações" or "Obrigações", from how much of the fund is bonds;
	// SuggestedGroupID is the user's group that matches it, if any.
	SuggestedGroup   string `json:"suggested_group"`
	SuggestedGroupID *int64 `json:"suggested_group_id"`
}

// GroupDrift is how far a group is from its target, with what it holds.
type GroupDrift struct {
	allocation.Drift
	Color         string  `json:"color"`
	IncludesCash  bool    `json:"includes_cash"`
	CashEUR       float64 `json:"cash_eur,omitempty"`
	HoldingsCount int     `json:"holdings_count"`
}

// AllocationStatus is the target allocation of a portfolio and how far the portfolio is from it.
type AllocationStatus struct {
	PortfolioID int64 `json:"portfolio_id"`
	// Configured is true once the portfolio has groups.
	Configured  bool                   `json:"configured"`
	Groups      []AllocationGroup      `json:"groups"`
	Assignments []AllocationAssignment `json:"assignments"`
	Drift       []GroupDrift           `json:"drift"`
	Holdings    []AllocationHolding    `json:"holdings"`
	// Unassigned are the holdings in no group: they aren't part of TotalEUR.
	Unassigned         []AllocationHolding `json:"unassigned"`
	UnassignedValueEUR float64             `json:"unassigned_value_eur"`
	// TotalEUR is the value the percentages are of: the holdings in a group, plus the cash if a group
	// includes it.
	TotalEUR             float64 `json:"total_eur"`
	CashEUR              float64 `json:"cash_eur"`
	CashIncluded         bool    `json:"cash_included"`
	TolerancePP          float64 `json:"tolerance_pp"`
	OutsideTolerance     bool    `json:"outside_tolerance"`
	HoldingsWithoutPrice int     `json:"holdings_without_price"`
}

// DepositAsset is the asset bought for a group.
type DepositAsset struct {
	ISIN        string  `json:"isin"`
	ProductName string  `json:"product_name"`
	PriceEUR    float64 `json:"price_eur"`
}

// DepositPlanLine is what a deposit buys for one group.
type DepositPlanLine struct {
	allocation.DepositShare
	Color        string        `json:"color"`
	IncludesCash bool          `json:"includes_cash"`
	Asset        *DepositAsset `json:"asset"`
	Shares       float64       `json:"shares"`
	CostEUR      float64       `json:"cost_eur"`
	// LeftoverEUR is the part of the amount that doesn't buy a whole share (all of it, with no asset).
	LeftoverEUR float64 `json:"leftover_eur"`
}

// DepositPlan splits a deposit across the groups, buying only.
type DepositPlan struct {
	AmountEUR          float64           `json:"amount_eur"`
	TotalBeforeEUR     float64           `json:"total_before_eur"`
	TotalAfterEUR      float64           `json:"total_after_eur"`
	Lines              []DepositPlanLine `json:"lines"`
	SharesCostEUR      float64           `json:"shares_cost_eur"`
	LeftoverEUR        float64           `json:"leftover_eur"`
	UnassignedValueEUR float64           `json:"unassigned_value_eur"`
	TolerancePP        float64           `json:"tolerance_pp"`
}

// checkAllocationPortfolio returns ErrAllocationPortfolioNotFound unless the portfolio belongs to the user.
func checkAllocationPortfolio(q interface {
	QueryRow(string, ...any) *sql.Row
}, userID, portfolioID int64) error {
	var one int
	err := q.QueryRow("SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?", portfolioID, userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAllocationPortfolioNotFound
	}
	if err != nil {
		return fmt.Errorf("failed to check the portfolio: %w", err)
	}
	return nil
}

func loadAllocationGroups(portfolioID int64) ([]AllocationGroup, error) {
	rows, err := database.DB.Query(`SELECT id, name, target_pct, COALESCE(color, ''), COALESCE(sort_order, 0), includes_cash
		FROM allocation_groups WHERE portfolio_id = ? ORDER BY COALESCE(sort_order, 0), id`, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the allocation groups: %w", err)
	}
	defer rows.Close()
	groups := []AllocationGroup{}
	for rows.Next() {
		var g AllocationGroup
		if err := rows.Scan(&g.ID, &g.Name, &g.TargetPct, &g.Color, &g.SortOrder, &g.IncludesCash); err != nil {
			return nil, fmt.Errorf("failed to read the allocation groups: %w", err)
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

func loadAllocationAssignments(portfolioID int64) ([]AllocationAssignment, error) {
	rows, err := database.DB.Query(`SELECT isin, group_id, preferred FROM allocation_assignments
		WHERE portfolio_id = ? ORDER BY isin`, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the allocation assignments: %w", err)
	}
	defer rows.Close()
	assignments := []AllocationAssignment{}
	for rows.Next() {
		var a AllocationAssignment
		if err := rows.Scan(&a.ISIN, &a.GroupID, &a.Preferred); err != nil {
			return nil, fmt.Errorf("failed to read the allocation assignments: %w", err)
		}
		assignments = append(assignments, a)
	}
	return assignments, rows.Err()
}

func loadAllocationTolerance(portfolioID int64) (float64, error) {
	var tolerance float64
	err := database.DB.QueryRow("SELECT tolerance_pp FROM allocation_settings WHERE portfolio_id = ?", portfolioID).Scan(&tolerance)
	if errors.Is(err, sql.ErrNoRows) {
		return allocation.DefaultTolerancePP, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to read the allocation settings: %w", err)
	}
	return tolerance, nil
}

// GetAllocation returns the portfolio's groups and assignments, and how far each group is from its target.
func (s *uploadServiceImpl) GetAllocation(userID, portfolioID int64) (*AllocationStatus, error) {
	if err := checkAllocationPortfolio(database.DB, userID, portfolioID); err != nil {
		return nil, err
	}
	groups, err := loadAllocationGroups(portfolioID)
	if err != nil {
		return nil, err
	}
	assignments, err := loadAllocationAssignments(portfolioID)
	if err != nil {
		return nil, err
	}
	tolerance, err := loadAllocationTolerance(portfolioID)
	if err != nil {
		return nil, err
	}
	holdingValues, err := s.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to value the holdings: %w", err)
	}
	cash, err := s.GetCurrentCashBalance(userID, portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the cash balance: %w", err)
	}

	byISIN := make(map[string]AllocationAssignment, len(assignments))
	for _, a := range assignments {
		byISIN[a.ISIN] = a
	}
	ruleGroups := make([]allocation.Group, len(groups))
	for i, g := range groups {
		ruleGroups[i] = allocation.Group{ID: g.ID, Name: g.Name, TargetPct: g.TargetPct, IncludesCash: g.IncludesCash}
	}

	status := &AllocationStatus{
		PortfolioID: portfolioID,
		Configured:  len(groups) > 0,
		Groups:      groups,
		Assignments: assignments,
		Drift:       []GroupDrift{},
		Holdings:    []AllocationHolding{},
		Unassigned:  []AllocationHolding{},
		CashEUR:     allocRound2(cash),
		TolerancePP: tolerance,
	}

	for _, h := range holdingValues {
		if h.Quantity <= 0 {
			continue
		}
		item := AllocationHolding{
			ISIN:        h.ISIN,
			ProductName: h.ProductName,
			AssetType:   h.AssetType,
			Quantity:    h.Quantity,
			PriceStatus: h.Status,
		}
		if h.Status == "OK" {
			item.PriceEUR = h.CurrentPriceEUR
			item.ValueEUR = h.MarketValueEUR
		} else {
			// As on the dashboard: without a price it counts at cost rather than as nothing.
			item.ValueEUR = h.TotalCostBasisEUR
			item.ValuedAtCost = true
			status.HoldingsWithoutPrice++
		}
		bondShare := h.SectorWeights[fundBondsSector]
		item.BondSharePct = allocRound2(bondShare * 100)
		item.SuggestedGroup = allocation.SuggestGroupName(bondShare)
		if id, ok := allocation.MatchGroup(item.SuggestedGroup, ruleGroups); ok {
			item.SuggestedGroupID = &id
		}
		if a, ok := byISIN[h.ISIN]; ok {
			groupID := a.GroupID
			item.GroupID = &groupID
			item.Preferred = a.Preferred
		}
		status.Holdings = append(status.Holdings, item)
	}
	sort.SliceStable(status.Holdings, func(i, j int) bool { return status.Holdings[i].ValueEUR > status.Holdings[j].ValueEUR })

	values, counts := map[int64]float64{}, map[int64]int{}
	for _, h := range status.Holdings {
		if h.GroupID == nil {
			status.Unassigned = append(status.Unassigned, h)
			status.UnassignedValueEUR += h.ValueEUR
			continue
		}
		values[*h.GroupID] += h.ValueEUR
		counts[*h.GroupID]++
	}
	status.UnassignedValueEUR = allocRound2(status.UnassignedValueEUR)

	groupValues := make([]allocation.GroupValue, len(groups))
	for i, g := range groups {
		value := values[g.ID]
		if g.IncludesCash {
			value += cash
			status.CashIncluded = true
		}
		groupValues[i] = allocation.GroupValue{Group: ruleGroups[i], ValueEUR: value}
	}
	status.TotalEUR = allocRound2(allocation.Total(groupValues))

	for i, d := range allocation.ComputeDrift(groupValues, tolerance) {
		g := groups[i]
		item := GroupDrift{Drift: d, Color: g.Color, IncludesCash: g.IncludesCash, HoldingsCount: counts[g.ID]}
		if g.IncludesCash {
			item.CashEUR = allocRound2(cash)
		}
		if d.OutsideTolerance {
			status.OutsideTolerance = true
		}
		status.Drift = append(status.Drift, item)
	}
	return status, nil
}

// SaveAllocationGroups replaces the portfolio's groups with the ones given, in one transaction. A group
// with an id keeps it (and its holdings); one without is new; a group left out is deleted, and its
// holdings become unassigned. The order given is the order shown.
func (s *uploadServiceImpl) SaveAllocationGroups(userID, portfolioID int64, groups []AllocationGroup) ([]AllocationGroup, error) {
	ruleGroups := make([]allocation.Group, len(groups))
	for i := range groups {
		groups[i].Name = strings.TrimSpace(groups[i].Name)
		groups[i].Color = strings.TrimSpace(groups[i].Color)
		ruleGroups[i] = allocation.Group{ID: groups[i].ID, Name: groups[i].Name, TargetPct: groups[i].TargetPct, IncludesCash: groups[i].IncludesCash}
	}
	if err := allocation.ValidateGroups(ruleGroups); err != nil {
		return nil, err
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to start the transaction: %w", err)
	}
	defer tx.Rollback()

	if err := checkAllocationPortfolio(tx, userID, portfolioID); err != nil {
		return nil, err
	}

	existing := map[int64]bool{}
	rows, err := tx.Query("SELECT id FROM allocation_groups WHERE portfolio_id = ?", portfolioID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the allocation groups: %w", err)
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, fmt.Errorf("failed to read the allocation groups: %w", err)
		}
		existing[id] = true
	}
	rows.Close()

	kept := map[int64]bool{}
	for _, g := range groups {
		if g.ID == 0 {
			continue
		}
		if !existing[g.ID] || kept[g.ID] {
			return nil, fmt.Errorf("%w: o grupo %d não existe neste portfólio", ErrAllocationInput, g.ID)
		}
		kept[g.ID] = true
	}
	for id := range existing {
		if !kept[id] {
			if _, err := tx.Exec("DELETE FROM allocation_groups WHERE id = ? AND portfolio_id = ?", id, portfolioID); err != nil {
				return nil, fmt.Errorf("failed to delete a group: %w", err)
			}
		}
	}
	// Free the names first, so that groups can swap names without breaking UNIQUE(portfolio_id, name).
	for id := range kept {
		if _, err := tx.Exec("UPDATE allocation_groups SET name = ? WHERE id = ? AND portfolio_id = ?",
			fmt.Sprintf("\x00renaming-%d", id), id, portfolioID); err != nil {
			return nil, fmt.Errorf("failed to rename a group: %w", err)
		}
	}
	for i, g := range groups {
		if g.ID != 0 {
			_, err = tx.Exec(`UPDATE allocation_groups SET name = ?, target_pct = ?, color = ?, sort_order = ?, includes_cash = ?
				WHERE id = ? AND portfolio_id = ?`, g.Name, g.TargetPct, g.Color, i, g.IncludesCash, g.ID, portfolioID)
		} else {
			_, err = tx.Exec(`INSERT INTO allocation_groups (portfolio_id, name, target_pct, color, sort_order, includes_cash)
				VALUES (?, ?, ?, ?, ?, ?)`, portfolioID, g.Name, g.TargetPct, g.Color, i, g.IncludesCash)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to save the group %q: %w", g.Name, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to save the groups: %w", err)
	}
	return loadAllocationGroups(portfolioID)
}

// SaveAllocationAssignments replaces the group of every holding of the portfolio with the ones given.
func (s *uploadServiceImpl) SaveAllocationAssignments(userID, portfolioID int64, assignments []AllocationAssignment) error {
	if err := checkAllocationPortfolio(database.DB, userID, portfolioID); err != nil {
		return err
	}
	groups, err := loadAllocationGroups(portfolioID)
	if err != nil {
		return err
	}
	groupIDs := make(map[int64]bool, len(groups))
	for _, g := range groups {
		groupIDs[g.ID] = true
	}
	ruleAssignments := make([]allocation.Assignment, len(assignments))
	for i := range assignments {
		assignments[i].ISIN = strings.TrimSpace(assignments[i].ISIN)
		ruleAssignments[i] = allocation.Assignment{ISIN: assignments[i].ISIN, GroupID: assignments[i].GroupID, Preferred: assignments[i].Preferred}
	}
	if err := allocation.ValidateAssignments(ruleAssignments, groupIDs); err != nil {
		return err
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to start the transaction: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM allocation_assignments WHERE portfolio_id = ?", portfolioID); err != nil {
		return fmt.Errorf("failed to clear the assignments: %w", err)
	}
	for _, a := range assignments {
		if _, err := tx.Exec(`INSERT INTO allocation_assignments (portfolio_id, isin, group_id, preferred) VALUES (?, ?, ?, ?)`,
			portfolioID, a.ISIN, a.GroupID, a.Preferred); err != nil {
			return fmt.Errorf("failed to save the assignment of %s: %w", a.ISIN, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to save the assignments: %w", err)
	}
	return nil
}

// SaveAllocationSettings stores the portfolio's allocation settings.
func (s *uploadServiceImpl) SaveAllocationSettings(userID, portfolioID int64, settings AllocationSettings) error {
	if err := allocation.ValidateTolerance(settings.TolerancePP); err != nil {
		return err
	}
	if err := checkAllocationPortfolio(database.DB, userID, portfolioID); err != nil {
		return err
	}
	_, err := database.DB.Exec(`INSERT INTO allocation_settings (portfolio_id, tolerance_pp) VALUES (?, ?)
		ON CONFLICT(portfolio_id) DO UPDATE SET tolerance_pp = excluded.tolerance_pp`, portfolioID, settings.TolerancePP)
	if err != nil {
		return fmt.Errorf("failed to save the allocation settings: %w", err)
	}
	return nil
}

// PlanAllocationDeposit splits a deposit across the groups to bring them closer to their targets,
// without selling, and works out the whole shares of each group's asset it buys. Nothing is stored.
func (s *uploadServiceImpl) PlanAllocationDeposit(userID, portfolioID int64, amountEUR float64) (*DepositPlan, error) {
	status, err := s.GetAllocation(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	groupValues := make([]allocation.GroupValue, len(status.Groups))
	for i, g := range status.Groups {
		groupValues[i] = allocation.GroupValue{
			Group:    allocation.Group{ID: g.ID, Name: g.Name, TargetPct: g.TargetPct, IncludesCash: g.IncludesCash},
			ValueEUR: status.Drift[i].ValueEUR,
		}
	}
	shares, err := allocation.PlanDeposit(groupValues, amountEUR)
	if err != nil {
		return nil, err
	}

	candidates := map[int64][]allocation.Candidate{}
	holdingsByISIN := map[string]AllocationHolding{}
	for _, h := range status.Holdings {
		if h.GroupID == nil {
			continue
		}
		holdingsByISIN[h.ISIN] = h
		candidates[*h.GroupID] = append(candidates[*h.GroupID], allocation.Candidate{
			ISIN: h.ISIN, ValueEUR: h.ValueEUR, PriceEUR: h.PriceEUR, Preferred: h.Preferred,
		})
	}

	plan := &DepositPlan{
		AmountEUR:          allocRound2(amountEUR),
		TotalBeforeEUR:     status.TotalEUR,
		TotalAfterEUR:      allocRound2(status.TotalEUR + amountEUR),
		Lines:              make([]DepositPlanLine, len(shares)),
		UnassignedValueEUR: status.UnassignedValueEUR,
		TolerancePP:        status.TolerancePP,
	}
	for i, share := range shares {
		g := status.Groups[i]
		line := DepositPlanLine{DepositShare: share, Color: g.Color, IncludesCash: g.IncludesCash, LeftoverEUR: share.AmountEUR}
		if c, ok := allocation.AssetToBuy(candidates[g.ID]); ok {
			h := holdingsByISIN[c.ISIN]
			line.Asset = &DepositAsset{ISIN: h.ISIN, ProductName: h.ProductName, PriceEUR: allocRound4(h.PriceEUR)}
			line.Shares, line.CostEUR, line.LeftoverEUR = allocation.SharesToBuy(share.AmountEUR, h.PriceEUR)
		}
		plan.SharesCostEUR += line.CostEUR
		plan.LeftoverEUR += line.LeftoverEUR
		plan.Lines[i] = line
	}
	plan.SharesCostEUR = allocRound2(plan.SharesCostEUR)
	plan.LeftoverEUR = allocRound2(plan.LeftoverEUR)
	return plan, nil
}

func allocRound2(v float64) float64 { return math.Round(v*100) / 100 }

func allocRound4(v float64) float64 { return math.Round(v*10000) / 10000 }
