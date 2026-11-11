package mcpserver

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const netWorthNote = "total_eur adds every broker portfolio of the user (holdings at market price, or at cost where " +
	"there's no price, plus cash) and the assets kept outside the brokers. Those other assets belong to the user, not " +
	"to a portfolio, so they're not in any portfolio's figures. A term deposit counts net of the 28% withheld on its " +
	"interest (gross_value_eur is before it), with the interest accrued so far. Crypto counts as quantity × price_eur " +
	"(Yahoo Finance, in EUR): price_status is OK for today's price, STALE when it's the last close (see price_date) " +
	"and UNAVAILABLE when there was no price, in which case the asset counts at cost_eur and unpriced_assets says " +
	"how many are in that state; mention it when it matters. cost_eur is the average cost of what's held, for " +
	"information: crypto isn't part of the tax figures. A Certificado de Aforro counts at the value the user typed from " +
	"AforroNet; when it has a series (D, E or F) and a subscription date, aforro_estimate is the app's estimate of what " +
	"it's worth now: that typed value plus the interest of the quarters ended since, at the rates IGCP published. It is " +
	"an estimate and is NOT in value_eur or in any total (counted_in_total is false) unless the user accepted it; say so " +
	"when quoting it, and when its status isn't ok give the reason. The other assets count at the last " +
	"value the user entered plus the money moved in or out since. month_change_eur includes deposits and withdrawals. " +
	"The history uses the last portfolio snapshot of each month."

func (s *Server) addNetWorthTools(server *mcp.Server, annotations *mcp.ToolAnnotations) {
	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_net_worth",
		Title: "Total net worth",
		Description: "The user's total net worth across every portfolio, plus the savings kept outside the brokers: " +
			"current and savings accounts, term deposits, Certificados de Aforro, PPR, crypto, property and others. Gives the " +
			"total, the value of each broker portfolio, each other asset with its value (and, for term deposits, rate, " +
			"maturity and interest gross and net of tax; for crypto, quantity, price and cost), the totals per type and " +
			"the value at the end of each month. " +
			"Takes no portfolio_id: it always covers everything.",
		Annotations: annotations,
	}, s.getNetWorth)
}

func (s *Server) getNetWorth(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
	result, err := s.uploads.GetNetWorth(s.userID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to work out the net worth: %w", err)
	}
	return nil, map[string]any{"net_worth": result, "note": netWorthNote}, nil
}
