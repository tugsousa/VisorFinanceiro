// Package mcpserver lets an AI assistant such as Claude read a user's portfolio through the Model
// Context Protocol (MCP). Claude Desktop starts the app with the "mcp" argument and calls the tools
// defined here. Every tool only reads, and only the data of the one user the server was started for.
package mcpserver

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/services"
)

const instructions = `VisorFinanceiro holds the user's investment portfolio, imported from their brokers (DEGIRO, Interactive Brokers).
All amounts are in EUR unless a field says otherwise. Dates of transactions, sales, lots and fees are DD-MM-YYYY; dates of the performance history are YYYY-MM-DD.
Each tool works on one portfolio: leave portfolio_id out to use the user's default portfolio, or call list_portfolios to see them all.
Start with get_portfolio_overview for questions about what the user owns and what it is worth.
get_net_worth covers every portfolio together, plus the savings outside the brokers (accounts, term deposits, Certificados de Aforro, PPR, crypto, property).
Market prices come from Yahoo Finance and may be delayed. A holding whose price_status isn't "OK" has no current price, so it isn't part of the market value totals; mention it when it matters.
The data is only as complete as the files the user uploaded, so say so when an answer depends on history that may be missing.
This is the user's own data for their own analysis; don't present answers as personalised financial or tax advice.`

// Server answers questions about the portfolios of a single user.
type Server struct {
	uploads services.UploadService
	userID  int64
}

// New returns the MCP server for the given user.
func New(uploads services.UploadService, userID int64, version string) *mcp.Server {
	s := &Server{uploads: uploads, userID: userID}

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "visorfinanceiro",
		Title:   "VisorFinanceiro",
		Version: version,
	}, &mcp.ServerOptions{Instructions: instructions})

	s.addTools(server)
	return server
}

type portfolioRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// portfolio returns the portfolio a tool works on: the requested one, if it belongs to the user, or
// else the user's default portfolio.
func (s *Server) portfolio(requested int64) (portfolioRef, error) {
	var p portfolioRef
	var err error
	if requested != 0 {
		err = database.DB.QueryRow(
			"SELECT id, name FROM portfolios WHERE id = ? AND user_id = ?", requested, s.userID,
		).Scan(&p.ID, &p.Name)
		if errors.Is(err, sql.ErrNoRows) {
			return p, fmt.Errorf("there is no portfolio with id %d, call list_portfolios to see the user's portfolios", requested)
		}
	} else {
		err = database.DB.QueryRow(
			"SELECT id, name FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1", s.userID,
		).Scan(&p.ID, &p.Name)
		if errors.Is(err, sql.ErrNoRows) {
			return p, errors.New("the user has no portfolios yet")
		}
	}
	if err != nil {
		return p, fmt.Errorf("failed to read the portfolio: %w", err)
	}
	return p, nil
}
