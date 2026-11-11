// Package allocation holds the rules of the target allocation: how far each group of holdings is from
// its target, how to split a deposit to get closer to the targets without selling, and how many shares
// that buys. It only does arithmetic; the service reads the groups and the holdings.
package allocation

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// TargetSumTolerance is how far from 100% the targets may add up to, in percentage points.
const TargetSumTolerance = 0.01

// DefaultTolerancePP is the drift, in percentage points, from which a group counts as off target.
const DefaultTolerancePP = 5.0

// Names of the groups suggested for a holding the user hasn't assigned yet.
const (
	SuggestedSharesGroup = "Ações"
	SuggestedBondsGroup  = "Obrigações"
)

// ErrInvalid is wrapped by every validation error, so callers can tell bad input from failures.
var ErrInvalid = errors.New("alocação inválida")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// Group is a group of holdings with its target share of the portfolio.
type Group struct {
	ID           int64
	Name         string
	TargetPct    float64 // 0-100
	IncludesCash bool
}

// Assignment puts a holding in a group. Preferred marks the asset to buy for that group.
type Assignment struct {
	ISIN      string
	GroupID   int64
	Preferred bool
}

// ValidateGroups checks that the names are filled in and unique, that each target is between 0 and
// 100 and that they add up to 100%, and that at most one group holds the cash.
func ValidateGroups(groups []Group) error {
	if len(groups) == 0 {
		return invalid("cria pelo menos um grupo")
	}
	seen := map[string]bool{}
	sum := 0.0
	cashGroups := 0
	for _, g := range groups {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			return invalid("todos os grupos precisam de um nome")
		}
		key := normalize(name)
		if seen[key] {
			return invalid("há dois grupos com o nome %q", name)
		}
		seen[key] = true
		if math.IsNaN(g.TargetPct) || g.TargetPct < 0 || g.TargetPct > 100 {
			return invalid("o alvo de %q tem de estar entre 0%% e 100%%", name)
		}
		sum += g.TargetPct
		if g.IncludesCash {
			cashGroups++
		}
	}
	if math.Abs(sum-100) > TargetSumTolerance {
		return invalid("os alvos somam %.2f%%, têm de somar 100%%", sum)
	}
	if cashGroups > 1 {
		return invalid("só um grupo pode incluir a liquidez")
	}
	return nil
}

// ValidateAssignments checks that each holding is in one group at most, that every group exists, and
// that each group has one preferred asset at most.
func ValidateAssignments(assignments []Assignment, groupIDs map[int64]bool) error {
	seen := map[string]bool{}
	preferred := map[int64]bool{}
	for _, a := range assignments {
		isin := strings.TrimSpace(a.ISIN)
		if isin == "" {
			return invalid("falta o ISIN de uma atribuição")
		}
		if seen[isin] {
			return invalid("o ativo %s está em mais do que um grupo", isin)
		}
		seen[isin] = true
		if !groupIDs[a.GroupID] {
			return invalid("o grupo do ativo %s não existe", isin)
		}
		if a.Preferred {
			if preferred[a.GroupID] {
				return invalid("cada grupo só pode ter um ativo preferido")
			}
			preferred[a.GroupID] = true
		}
	}
	return nil
}

// ValidateTolerance checks the tolerance in percentage points.
func ValidateTolerance(tolerancePP float64) error {
	if math.IsNaN(tolerancePP) || tolerancePP <= 0 || tolerancePP > 50 {
		return invalid("a tolerância tem de estar entre 0 e 50 pontos percentuais")
	}
	return nil
}

// GroupValue is a group with the current value of what it holds.
type GroupValue struct {
	Group
	ValueEUR float64
}

// Drift is how far a group is from its target.
type Drift struct {
	GroupID    int64   `json:"group_id"`
	Name       string  `json:"name"`
	TargetPct  float64 `json:"target_pct"`
	ValueEUR   float64 `json:"value_eur"`
	CurrentPct float64 `json:"current_pct"`
	// DiffPP is the current share minus the target, in percentage points: positive when over target.
	DiffPP float64 `json:"diff_pp"`
	// DiffEUR is the value minus the value at target: positive when over target.
	DiffEUR          float64 `json:"diff_eur"`
	TargetValueEUR   float64 `json:"target_value_eur"`
	OutsideTolerance bool    `json:"outside_tolerance"`
}

// Total adds up the values of the groups.
func Total(groups []GroupValue) float64 {
	total := 0.0
	for _, g := range groups {
		total += g.ValueEUR
	}
	return total
}

// ComputeDrift returns, for each group in the order given, its share of the total and how far it is
// from its target. A group counts as outside the tolerance when it's more than tolerancePP points away.
func ComputeDrift(groups []GroupValue, tolerancePP float64) []Drift {
	total := Total(groups)
	result := make([]Drift, 0, len(groups))
	for _, g := range groups {
		currentPct := 0.0
		if total > 0 {
			currentPct = g.ValueEUR / total * 100
		}
		targetValue := g.TargetPct / 100 * total
		diffPP := currentPct - g.TargetPct
		result = append(result, Drift{
			GroupID:          g.ID,
			Name:             g.Name,
			TargetPct:        g.TargetPct,
			ValueEUR:         round2(g.ValueEUR),
			CurrentPct:       round2(currentPct),
			DiffPP:           round2(diffPP),
			DiffEUR:          round2(g.ValueEUR - targetValue),
			TargetValueEUR:   round2(targetValue),
			OutsideTolerance: total > 0 && math.Abs(diffPP) > tolerancePP+1e-9,
		})
	}
	return result
}

// DepositShare is the part of a deposit that goes to one group.
type DepositShare struct {
	GroupID        int64   `json:"group_id"`
	Name           string  `json:"name"`
	TargetPct      float64 `json:"target_pct"`
	ValueBeforeEUR float64 `json:"value_before_eur"`
	PctBefore      float64 `json:"pct_before"`
	AmountEUR      float64 `json:"amount_eur"`
	ValueAfterEUR  float64 `json:"value_after_eur"`
	PctAfter       float64 `json:"pct_after"`
}

// PlanDeposit splits a deposit across the groups to bring them closer to their targets, without
// selling anything. With T the total after the deposit, a group lacks max(0, target × T − value). When
// the deposit covers what every group lacks, each gets what it lacks and the rest is split by target;
// otherwise the deposit is split in proportion to what each group lacks.
func PlanDeposit(groups []GroupValue, deposit float64) ([]DepositShare, error) {
	if math.IsNaN(deposit) || deposit <= 0 {
		return nil, invalid("o valor a investir tem de ser maior do que zero")
	}
	if len(groups) == 0 {
		return nil, invalid("define primeiro os grupos e os alvos")
	}

	before := Total(groups)
	after := before + deposit

	needs := make([]float64, len(groups))
	totalNeed := 0.0
	targetSum := 0.0
	for i, g := range groups {
		needs[i] = math.Max(0, g.TargetPct/100*after-g.ValueEUR)
		totalNeed += needs[i]
		targetSum += g.TargetPct
	}

	amounts := make([]float64, len(groups))
	if totalNeed <= deposit {
		rest := deposit - totalNeed
		for i, g := range groups {
			amounts[i] = needs[i]
			if targetSum > 0 {
				amounts[i] += rest * g.TargetPct / targetSum
			} else {
				amounts[i] += rest / float64(len(groups))
			}
		}
	} else {
		for i := range groups {
			amounts[i] = deposit * needs[i] / totalNeed
		}
	}

	result := make([]DepositShare, len(groups))
	for i, g := range groups {
		valueAfter := g.ValueEUR + amounts[i]
		result[i] = DepositShare{
			GroupID:        g.ID,
			Name:           g.Name,
			TargetPct:      g.TargetPct,
			ValueBeforeEUR: round2(g.ValueEUR),
			PctBefore:      round2(share(g.ValueEUR, before)),
			AmountEUR:      round2(amounts[i]),
			ValueAfterEUR:  round2(valueAfter),
			PctAfter:       round2(share(valueAfter, after)),
		}
	}
	return result, nil
}

// SharesToBuy returns how many whole shares an amount buys at a price, and the amount left over. With
// no price it buys nothing and all of the amount is left over.
func SharesToBuy(amountEUR, priceEUR float64) (shares float64, costEUR float64, leftoverEUR float64) {
	if priceEUR <= 0 || amountEUR <= 0 {
		return 0, 0, math.Max(0, round2(amountEUR))
	}
	// The small epsilon keeps an amount that is exactly n shares, give or take rounding, at n.
	shares = math.Floor(amountEUR/priceEUR + 1e-9)
	costEUR = shares * priceEUR
	return shares, round2(costEUR), round2(math.Max(0, amountEUR-costEUR))
}

// Candidate is a holding of a group that could be bought for it.
type Candidate struct {
	ISIN      string
	ValueEUR  float64
	PriceEUR  float64
	Preferred bool
}

// AssetToBuy picks the asset to buy for a group: the preferred one, or else the largest one with a
// price. It returns false when the group has none.
func AssetToBuy(candidates []Candidate) (Candidate, bool) {
	for _, c := range candidates {
		if c.Preferred {
			return c, true
		}
	}
	sorted := append([]Candidate(nil), candidates...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].ValueEUR > sorted[j].ValueEUR })
	for _, c := range sorted {
		if c.PriceEUR > 0 {
			return c, true
		}
	}
	return Candidate{}, false
}

// SuggestGroupName suggests the group of a holding from the share of its fund that is bonds (0-1):
// mostly bonds goes to "Obrigações", anything else to "Ações".
func SuggestGroupName(bondShare float64) string {
	if bondShare >= 0.5 {
		return SuggestedBondsGroup
	}
	return SuggestedSharesGroup
}

// MatchGroup finds, among the user's groups, the one that a suggested group name stands for: one with
// the same name, or else one whose name mentions bonds or shares. It returns false when none does.
func MatchGroup(suggested string, groups []Group) (int64, bool) {
	want := normalize(suggested)
	for _, g := range groups {
		if normalize(g.Name) == want {
			return g.ID, true
		}
	}
	keywords := []string{"acoes", "acao", "equity", "stock", "shares"}
	if suggested == SuggestedBondsGroup {
		keywords = []string{"obrigac", "bond", "rendimento fixo", "renda fixa"}
	}
	for _, g := range groups {
		name := normalize(g.Name)
		for _, k := range keywords {
			if strings.Contains(name, k) {
				return g.ID, true
			}
		}
	}
	return 0, false
}

// normalize lowercases a name and removes its accents, so "Ações" and "acoes" compare equal.
func normalize(s string) string {
	return accents.Replace(strings.ToLower(strings.TrimSpace(s)))
}

var accents = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c", "ñ", "n",
)

func share(part, whole float64) float64 {
	if whole == 0 {
		return 0
	}
	return part / whole * 100
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
