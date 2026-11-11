package mcpserver

import (
	"context"
	"errors"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/username/taxfolio/backend/src/services"
)

const allocationNote = "The groups and their targets are set by the user on the Portfólio page (tab Alocação-alvo). " +
	"Percentages are of the holdings assigned to a group, plus the cash when a group includes it; holdings in no group " +
	"are left out. Holdings without a market price count at cost. Not financial advice."

const notConfiguredNote = "The user hasn't set a target allocation for this portfolio yet: it is set on the Portfólio " +
	"page, tab Alocação-alvo, by creating groups with target percentages and assigning each holding to one."

func (s *Server) addAllocationTools(server *mcp.Server, annotations *mcp.ToolAnnotations) {
	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_allocation_drift",
		Title: "Target allocation drift",
		Description: "The user's target allocation (groups of holdings with a target %, such as 80% shares and 20% bonds) " +
			"and how far the portfolio is from it: each group's value, current %, target %, difference in points and in EUR, " +
			"and whether it's outside the user's tolerance. Also lists the holdings of each group and those in no group.",
		Annotations: annotations,
	}, s.getAllocationDrift)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "plan_deposit",
		Title: "Plan a deposit",
		Description: "Splits a new deposit across the user's allocation groups to get closer to their targets without " +
			"selling anything, and how many whole shares of each group's asset it buys (the asset the user marked as " +
			"preferred, or else the group's largest holding). Nothing is stored.",
		Annotations: annotations,
	}, s.planDeposit)
}

type planDepositInput struct {
	PortfolioID int64   `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	AmountEUR   float64 `json:"amount_eur" jsonschema:"the amount to invest, in EUR"`
}

func (s *Server) getAllocationDrift(_ context.Context, _ *mcp.CallToolRequest, in portfolioInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	status, err := s.uploads.GetAllocation(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the target allocation: %w", err)
	}
	if !status.Configured {
		return nil, map[string]any{"portfolio": p.Name, "configured": false, "note": notConfiguredNote}, nil
	}

	type holding struct {
		ISIN         string  `json:"isin"`
		Name         string  `json:"name"`
		ValueEUR     float64 `json:"value_eur"`
		ValuedAtCost bool    `json:"valued_at_cost,omitempty"`
		Preferred    bool    `json:"preferred_to_buy,omitempty"`
	}
	holdingsOf := map[int64][]holding{}
	for _, h := range status.Holdings {
		if h.GroupID != nil {
			holdingsOf[*h.GroupID] = append(holdingsOf[*h.GroupID], holding{
				ISIN: h.ISIN, Name: h.ProductName, ValueEUR: round2(h.ValueEUR), ValuedAtCost: h.ValuedAtCost, Preferred: h.Preferred,
			})
		}
	}
	type group struct {
		services.GroupDrift
		Holdings []holding `json:"holdings"`
	}
	groups := make([]group, len(status.Drift))
	for i, d := range status.Drift {
		groups[i] = group{GroupDrift: d, Holdings: holdingsOf[d.GroupID]}
		if groups[i].Holdings == nil {
			groups[i].Holdings = []holding{}
		}
	}
	unassigned := make([]holding, 0, len(status.Unassigned))
	for _, h := range status.Unassigned {
		unassigned = append(unassigned, holding{ISIN: h.ISIN, Name: h.ProductName, ValueEUR: round2(h.ValueEUR), ValuedAtCost: h.ValuedAtCost})
	}

	return nil, map[string]any{
		"portfolio":              p.Name,
		"configured":             true,
		"total_eur":              status.TotalEUR,
		"cash_eur":               status.CashEUR,
		"cash_included":          status.CashIncluded,
		"tolerance_pp":           status.TolerancePP,
		"any_outside_tolerance":  status.OutsideTolerance,
		"groups":                 groups,
		"unassigned_holdings":    unassigned,
		"unassigned_value_eur":   status.UnassignedValueEUR,
		"holdings_without_price": status.HoldingsWithoutPrice,
		"note":                   allocationNote,
	}, nil
}

func (s *Server) planDeposit(_ context.Context, _ *mcp.CallToolRequest, in planDepositInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	plan, err := s.uploads.PlanAllocationDeposit(s.userID, p.ID, in.AmountEUR)
	if err != nil {
		if errors.Is(err, services.ErrAllocationInput) {
			return nil, nil, err
		}
		return nil, nil, fmt.Errorf("failed to plan the deposit: %w", err)
	}
	return nil, map[string]any{
		"portfolio": p.Name,
		"plan":      plan,
		"note": "Whole shares at the current price, before commissions; leftover_eur is what doesn't buy a whole share. " +
			allocationNote,
	}, nil
}
