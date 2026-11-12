package mcpserver

import (
	"context"
	"errors"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/username/taxfolio/backend/src/services"
)

const taxNote = "Estimate at the Portuguese autonomous rate of 28% on the year's balance of capital gains " +
	"(shares and options), after commissions. Short-term results (lots held under 365 days) must be added to the " +
	"other income when the taxable income reaches the top bracket, which this doesn't apply. It ignores losses of " +
	"earlier years. Not tax advice."

func (s *Server) addTaxTools(server *mcp.Server, annotations *mcp.ToolAnnotations) {
	mcp.AddTool(server, &mcp.Tool{
		Name:  "simulate_sale",
		Title: "Simulate a sale",
		Description: "Simulates selling shares of a position today, without storing anything: the purchase lots it would " +
			"use (FIFO, oldest first), the gain, the holding period of each lot, and how much this year's Portuguese " +
			"capital gains tax would change, counting the sales already made this year. Leave price_eur out to use the " +
			"current market price.",
		Annotations: annotations,
	}, s.simulateSale)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_tax_year_status",
		Title: "Tax situation of this year",
		Description: "This year's capital gains balance so far and its estimated tax, and for each position held: the " +
			"unrealised gain or loss, how this year's tax would change if it were all sold today, and its lots with the " +
			"date each one reaches 365 days. Use it for questions about realising losses to offset gains.",
		Annotations: annotations,
	}, s.getTaxYearStatus)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "plan_tax_loss_harvest",
		Title: "Sales at a loss that lower this year's tax",
		Description: "Which positions held at a loss could be sold today, and how many shares of each (FIFO, oldest lots " +
			"first, stopping where the loss is largest), to lower this year's capital gains tax without realising more " +
			"loss than the year's positive balance needs. Returns each sale with its lots, the year's balance and tax " +
			"before and after, the tax saved, and the positions left out (no price, or a saving below the commission). " +
			"Nothing is stored. Buying back lowers the cost, so the tax saved is mostly deferred, not avoided.",
		Annotations: annotations,
	}, s.planTaxLossHarvest)
}

type planTaxLossHarvestInput struct {
	PortfolioID   int64   `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	CommissionEUR float64 `json:"commission_eur,omitempty" jsonschema:"expected commission of each sale in EUR; positions whose tax saving isn't more than it are left out"`
}

const harvestNote = " The balance is this portfolio's only, while the tax is on all of a person's sales in the year. " +
	"Selling and buying back lowers the cost of the new lot by the same loss and restarts the 365-day count, so the " +
	"tax saved comes back when it's sold, unless that year's balance is negative. Losses on securities of entities in " +
	"tax havens (e.g. the Cayman Islands) may not offset other gains. The sale must be made in time to count in this year."

func (s *Server) planTaxLossHarvest(_ context.Context, _ *mcp.CallToolRequest, in planTaxLossHarvestInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	plan, err := s.uploads.PlanTaxLossHarvest(s.userID, p.ID, in.CommissionEUR)
	if err != nil {
		if errors.Is(err, services.ErrSimulationInput) {
			return nil, nil, err
		}
		return nil, nil, fmt.Errorf("failed to plan the loss harvest: %w", err)
	}
	return nil, map[string]any{"portfolio": p.Name, "plan": plan, "note": taxNote + harvestNote}, nil
}

type simulateSaleInput struct {
	PortfolioID   int64   `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	ISIN          string  `json:"isin" jsonschema:"the ISIN of the position to sell (see get_portfolio_overview)"`
	Quantity      float64 `json:"quantity" jsonschema:"how many shares to sell"`
	PriceEUR      float64 `json:"price_eur,omitempty" jsonschema:"sale price per share in EUR; leave it out for the current price"`
	CommissionEUR float64 `json:"commission_eur,omitempty" jsonschema:"commission of the sale in EUR"`
}

func (s *Server) simulateSale(_ context.Context, _ *mcp.CallToolRequest, in simulateSaleInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	result, err := s.uploads.SimulateStockSale(s.userID, p.ID, services.SaleSimulationRequest{
		ISIN:       in.ISIN,
		Quantity:   in.Quantity,
		PriceEUR:   in.PriceEUR,
		Commission: in.CommissionEUR,
	})
	if err != nil {
		if errors.Is(err, services.ErrSimulationInput) {
			return nil, nil, err
		}
		return nil, nil, fmt.Errorf("failed to simulate the sale: %w", err)
	}
	return nil, map[string]any{"portfolio": p.Name, "simulation": result, "note": taxNote}, nil
}

func (s *Server) getTaxYearStatus(_ context.Context, _ *mcp.CallToolRequest, in portfolioInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	status, err := s.uploads.GetTaxYearStatus(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the tax situation: %w", err)
	}
	return nil, map[string]any{"portfolio": p.Name, "status": status, "note": taxNote}, nil
}
