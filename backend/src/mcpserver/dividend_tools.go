package mcpserver

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

const dividendCalendarNote = "Amounts assume the quantity held today; the right to a dividend depends on holding the " +
	"shares on the ex-dividend date. status: announced = dates announced by the company (or ex-date passed and payment " +
	"still to come), estimated = last year's dividend moved forward one year, received = a matching dividend " +
	"transaction exists (its real amounts are shown), missed = ex-date and expected payment passed with no matching " +
	"transaction in the uploaded files. pay_date is null when there is no payment history to estimate it from; " +
	"net_eur is null when there is no withholding history (it uses the tax withheld over the last 24 months). " +
	"Dates are DD-MM-YYYY. Market data from Yahoo Finance."

func (s *Server) addDividendTools(server *mcp.Server, annotations *mcp.ToolAnnotations) {
	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_dividend_calendar",
		Title: "Dividend calendar",
		Description: "The next dividends of the positions held, one per payment: ex-dividend date, payment date, amount " +
			"per share, gross and net amount in EUR, and whether it's announced, estimated or already received. " +
			"Covers up to the next 12 months; set include_past to also see the last 3 months (received or missed).",
		Annotations: annotations,
	}, s.getDividendCalendar)
}

type dividendCalendarInput struct {
	PortfolioID int64 `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	Days        int   `json:"days,omitempty" jsonschema:"how many days ahead to list, from 1 to 365 (default 365)"`
	IncludePast bool  `json:"include_past,omitempty" jsonschema:"also list the dividends of the last 3 months that already went ex"`
}

func (s *Server) getDividendCalendar(_ context.Context, _ *mcp.CallToolRequest, in dividendCalendarInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	calendar, err := s.uploads.GetDividendCalendar(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to build the dividend calendar: %w", err)
	}

	days := in.Days
	if days <= 0 || days > 365 {
		days = 365
	}
	today := utils.ParseDate(calendar.Today)
	until := today.AddDate(0, 0, days)

	events := []services.DividendCalendarEvent{}
	var gross, net float64
	netComplete := true
	for _, e := range calendar.Events {
		exDate := utils.ParseDate(e.ExDate)
		upcoming := !exDate.Before(today) || e.Status == services.DividendStatusAnnounced
		if exDate.After(until) || (!upcoming && !in.IncludePast) {
			continue
		}
		events = append(events, e)
		if upcoming {
			gross += e.GrossEUR
			if e.NetEUR != nil {
				net += *e.NetEUR
			} else {
				netComplete = false
			}
		}
	}

	result := map[string]any{
		"portfolio":          p.Name,
		"today":              calendar.Today,
		"until":              until.Format(utils.DefaultDateFormat),
		"events":             events,
		"upcoming_gross_eur": gross,
		"skipped_positions":  calendar.Skipped,
		"note":               dividendCalendarNote,
	}
	if netComplete {
		result["upcoming_net_eur"] = net
	} else {
		result["upcoming_net_eur_partial"] = net
		result["upcoming_net_note"] = "Some events have no net estimate (no withholding history), so the net total leaves them out."
	}
	return nil, result, nil
}
