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
