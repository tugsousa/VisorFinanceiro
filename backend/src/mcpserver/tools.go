package mcpserver

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
)

const (
	defaultTransactionLimit = 100
	maxTransactionLimit     = 1000
	maxFeesListed           = 200
)

func (s *Server) addTools(server *mcp.Server) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: boolPtr(false)}
	// Holdings are valued with prices fetched from the internet.
	readOnlyOnline := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: boolPtr(true)}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_portfolios",
		Title:       "List portfolios",
		Description: "Lists the user's portfolios. The default one is used when a tool gets no portfolio_id.",
		Annotations: readOnly,
	}, s.listPortfolios)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_portfolio_overview",
		Title: "Portfolio overview",
		Description: "Current stock and ETF holdings with quantity, cost, market value, unrealised gain, weight, sector, " +
			"industry and country, plus the cash balance and totals. The best starting point for most questions.",
		Annotations: readOnlyOnline,
	}, s.getPortfolioOverview)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_open_lots",
		Title: "Open purchase lots",
		Description: "The purchase lots of the stocks still held (FIFO): when each was bought, how many shares remain, " +
			"and at what price and cost. Use it for questions about holding periods or the cost of a specific position.",
		Annotations: readOnly,
	}, s.getOpenLots)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_option_positions",
		Title:       "Open option positions",
		Description: "The option positions still open. A negative quantity is a short (written) position.",
		Annotations: readOnly,
	}, s.getOptionPositions)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_realized_gains",
		Title: "Realised gains",
		Description: "Closed stock sales (FIFO matched to their purchases) and closed option positions, with profit or loss " +
			"in EUR and totals per year; the individual sales are listed when a year or ISIN is given. Also lists sales that couldn't be matched to a purchase, usually because the uploaded history is incomplete.",
		Annotations: readOnly,
	}, s.getRealizedGains)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_dividends",
		Title: "Dividends",
		Description: "Dividends received per year and source country (gross and tax withheld), the trailing twelve months total, " +
			"yield, yield on cost and the projected dividends per month of the next year. Can include the individual payments.",
		Annotations: readOnlyOnline,
	}, s.getDividends)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_fees",
		Title:       "Fees",
		Description: "Broker fees and costs, with totals per year and category, and the individual fees.",
		Annotations: readOnly,
	}, s.getFees)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_performance_history",
		Title: "Performance history",
		Description: "The portfolio's value over time, from daily snapshots: total value, net amount deposited so far, cash, " +
			"and the value the same deposits would have if invested in the S&P 500 (SPY), as a benchmark.",
		Annotations: readOnlyOnline,
	}, s.getPerformanceHistory)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_transactions",
		Title: "Transactions",
		Description: "The imported transactions, newest first, filtered by year, type, ISIN or text. " +
			"Use the other tools for totals; this one is for looking up specific operations.",
		Annotations: readOnly,
	}, s.getTransactions)
}

// --- Inputs ---

type portfolioInput struct {
	PortfolioID int64 `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
}

type lotsInput struct {
	PortfolioID int64  `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	ISIN        string `json:"isin,omitempty" jsonschema:"only the lots of this ISIN"`
}

type yearInput struct {
	PortfolioID int64 `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	Year        int   `json:"year,omitempty" jsonschema:"only this year, such as 2025; leave it out for all years"`
}

type gainsInput struct {
	PortfolioID int64  `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	Year        int    `json:"year,omitempty" jsonschema:"only sales closed in this year, such as 2025; leave it out for all years"`
	ISIN        string `json:"isin,omitempty" jsonschema:"only the stock sales of this ISIN"`
}

type dividendsInput struct {
	PortfolioID     int64 `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	Year            int   `json:"year,omitempty" jsonschema:"only this year, such as 2025; leave it out for all years"`
	IncludePayments bool  `json:"include_payments,omitempty" jsonschema:"also list each dividend payment and withholding tax line"`
}

type historyInput struct {
	PortfolioID int64  `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	From        string `json:"from,omitempty" jsonschema:"first date, YYYY-MM-DD"`
	To          string `json:"to,omitempty" jsonschema:"last date, YYYY-MM-DD"`
	Interval    string `json:"interval,omitempty" jsonschema:"one point per day, week or month (the default): daily, weekly or monthly"`
}

type transactionsInput struct {
	PortfolioID int64  `json:"portfolio_id,omitempty" jsonschema:"the portfolio to use; leave it out for the default portfolio"`
	Year        int    `json:"year,omitempty" jsonschema:"only this year, such as 2025"`
	Type        string `json:"type,omitempty" jsonschema:"only this type: STOCK, OPTION, DIVIDEND, FEE or CASH"`
	ISIN        string `json:"isin,omitempty" jsonschema:"only this ISIN"`
	Search      string `json:"search,omitempty" jsonschema:"only transactions whose product name or description contains this text"`
	Limit       int    `json:"limit,omitempty" jsonschema:"the most transactions to return, 100 by default and 1000 at most"`
}

// --- Tools ---

func (s *Server) listPortfolios(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
	rows, err := database.DB.QueryContext(ctx,
		"SELECT id, name, description, is_default FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, name ASC", s.userID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the portfolios: %w", err)
	}
	defer rows.Close()

	type portfolio struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
		IsDefault   bool   `json:"is_default"`
	}
	portfolios := []portfolio{}
	for rows.Next() {
		var p portfolio
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.IsDefault); err != nil {
			return nil, nil, fmt.Errorf("failed to read the portfolios: %w", err)
		}
		portfolios = append(portfolios, p)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("failed to read the portfolios: %w", err)
	}
	return nil, map[string]any{"portfolios": portfolios}, nil
}

func (s *Server) getPortfolioOverview(_ context.Context, _ *mcp.CallToolRequest, in portfolioInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	holdings, err := s.uploads.GetCurrentHoldingsWithValue(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to value the holdings: %w", err)
	}
	cash, err := s.uploads.GetCurrentCashBalance(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the cash balance: %w", err)
	}
	options, err := s.uploads.GetOptionHoldings(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the option positions: %w", err)
	}

	type holding struct {
		Name              string  `json:"name"`
		ISIN              string  `json:"isin"`
		AssetType         string  `json:"asset_type,omitempty"`
		Sector            string  `json:"sector,omitempty"`
		Industry          string  `json:"industry,omitempty"`
		Country           string  `json:"country,omitempty"`
		Quantity          float64 `json:"quantity"`
		CostEUR           float64 `json:"cost_eur"`
		PriceEUR          float64 `json:"price_eur,omitempty"`
		MarketValueEUR    float64 `json:"market_value_eur,omitempty"`
		UnrealizedGainEUR float64 `json:"unrealized_gain_eur,omitempty"`
		UnrealizedGainPct float64 `json:"unrealized_gain_pct,omitempty"`
		WeightPct         float64 `json:"weight_pct,omitempty"`
		PriceStatus       string  `json:"price_status"`
	}

	var totalValue, pricedCost, unpricedCost float64
	for _, h := range holdings {
		if h.Status == "OK" {
			totalValue += h.MarketValueEUR
			pricedCost += h.TotalCostBasisEUR
		} else {
			unpricedCost += h.TotalCostBasisEUR
		}
	}

	result := make([]holding, 0, len(holdings))
	for _, h := range holdings {
		if h.Quantity <= 0 {
			continue
		}
		item := holding{
			Name:        h.ProductName,
			ISIN:        h.ISIN,
			AssetType:   h.AssetType,
			Sector:      h.Sector,
			Industry:    h.Industry,
			Country:     strings.TrimSpace(h.CountryCode),
			Quantity:    h.Quantity,
			CostEUR:     round2(h.TotalCostBasisEUR),
			PriceStatus: h.Status,
		}
		if h.Status == "OK" {
			item.PriceEUR = round4(h.CurrentPriceEUR)
			item.MarketValueEUR = round2(h.MarketValueEUR)
			item.UnrealizedGainEUR = round2(h.MarketValueEUR - h.TotalCostBasisEUR)
			item.UnrealizedGainPct = percent(h.MarketValueEUR-h.TotalCostBasisEUR, h.TotalCostBasisEUR)
			item.WeightPct = percent(h.MarketValueEUR, totalValue)
		}
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].MarketValueEUR != result[j].MarketValueEUR {
			return result[i].MarketValueEUR > result[j].MarketValueEUR
		}
		return result[i].CostEUR > result[j].CostEUR
	})

	return nil, map[string]any{
		"portfolio": p,
		"as_of":     time.Now().Format("2006-01-02 15:04"),
		"totals": map[string]any{
			"holdings_market_value_eur":     round2(totalValue),
			"holdings_cost_eur":             round2(pricedCost),
			"unrealized_gain_eur":           round2(totalValue - pricedCost),
			"unrealized_gain_pct":           percent(totalValue-pricedCost, pricedCost),
			"cost_of_unpriced_holdings_eur": round2(unpricedCost),
			"cash_balance_eur":              round2(cash),
			"total_value_eur":               round2(totalValue + cash),
			"open_option_positions":         len(options),
		},
		"holdings": result,
	}, nil
}

func (s *Server) getOpenLots(_ context.Context, _ *mcp.CallToolRequest, in lotsInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	byYear, err := s.uploads.GetStockHoldings(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the holdings: %w", err)
	}
	// The holdings are kept as they were at the end of each year; the latest year is the current one.
	latest := ""
	for year := range byYear {
		if year > latest {
			latest = year
		}
	}

	type lot struct {
		Name        string  `json:"name"`
		ISIN        string  `json:"isin"`
		BuyDate     string  `json:"buy_date"`
		Quantity    float64 `json:"quantity"`
		BuyPrice    float64 `json:"buy_price"`
		Currency    string  `json:"currency"`
		CostEUR     float64 `json:"cost_eur"`
		HeldForDays int     `json:"held_for_days,omitempty"`
	}
	lots := []lot{}
	for _, l := range byYear[latest] {
		if l.Quantity <= 0 || (in.ISIN != "" && !strings.EqualFold(l.ISIN, in.ISIN)) {
			continue
		}
		item := lot{
			Name:     l.ProductName,
			ISIN:     l.ISIN,
			BuyDate:  l.BuyDate,
			Quantity: l.Quantity,
			BuyPrice: l.BuyPrice,
			Currency: l.BuyCurrency,
			CostEUR:  round2(math.Abs(l.BuyAmountEUR)),
		}
		if bought, ok := parseDate(l.BuyDate); ok {
			item.HeldForDays = int(time.Since(bought).Hours() / 24)
		}
		lots = append(lots, item)
	}
	sort.SliceStable(lots, func(i, j int) bool {
		if lots[i].Name != lots[j].Name {
			return lots[i].Name < lots[j].Name
		}
		return dateKey(lots[i].BuyDate) < dateKey(lots[j].BuyDate)
	})

	return nil, map[string]any{"portfolio": p, "lots": lots}, nil
}

func (s *Server) getOptionPositions(_ context.Context, _ *mcp.CallToolRequest, in portfolioInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	options, err := s.uploads.GetOptionHoldings(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the option positions: %w", err)
	}

	type position struct {
		Name          string  `json:"name"`
		OpenDate      string  `json:"open_date"`
		Quantity      float64 `json:"quantity"`
		OpenPrice     float64 `json:"open_price"`
		Currency      string  `json:"currency"`
		OpenAmountEUR float64 `json:"open_amount_eur"`
	}
	positions := make([]position, 0, len(options))
	for _, o := range options {
		positions = append(positions, position{
			Name:          o.ProductName,
			OpenDate:      o.OpenDate,
			Quantity:      o.Quantity,
			OpenPrice:     o.OpenPrice,
			Currency:      o.OpenCurrency,
			OpenAmountEUR: round2(o.OpenAmountEUR),
		})
	}
	return nil, map[string]any{"portfolio": p, "positions": positions}, nil
}

func (s *Server) getRealizedGains(_ context.Context, _ *mcp.CallToolRequest, in gainsInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	stockSales, err := s.uploads.GetStockSaleDetails(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the stock sales: %w", err)
	}
	optionSales, err := s.uploads.GetOptionSaleDetails(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the option sales: %w", err)
	}
	unmatched, err := s.uploads.GetUnmatchedStockSales(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the unmatched sales: %w", err)
	}

	type yearTotals struct {
		StockProceedsEUR  float64 `json:"stock_proceeds_eur"`
		StockCostEUR      float64 `json:"stock_cost_eur"`
		StockCommissions  float64 `json:"stock_commissions_eur"`
		StockGainEUR      float64 `json:"stock_gain_eur"`
		OptionGainEUR     float64 `json:"option_gain_eur"`
		TotalGainEUR      float64 `json:"total_gain_eur"`
		StockSalesCount   int     `json:"stock_sales"`
		OptionClosesCount int     `json:"option_closes"`
	}
	type stockSale struct {
		Name        string  `json:"name"`
		ISIN        string  `json:"isin"`
		Country     string  `json:"country,omitempty"`
		BuyDate     string  `json:"buy_date"`
		SaleDate    string  `json:"sale_date"`
		Quantity    float64 `json:"quantity"`
		BuyPrice    float64 `json:"buy_price"`
		BuyCurrency string  `json:"buy_currency"`
		SalePrice   float64 `json:"sale_price"`
		SaleCurr    string  `json:"sale_currency"`
		CostEUR     float64 `json:"cost_eur"`
		ProceedsEUR float64 `json:"proceeds_eur"`
		Commission  float64 `json:"commission_eur"`
		GainEUR     float64 `json:"gain_eur"`
	}
	type optionClose struct {
		Name      string  `json:"name"`
		OpenDate  string  `json:"open_date"`
		CloseDate string  `json:"close_date"`
		Quantity  float64 `json:"quantity"`
		OpenEUR   float64 `json:"open_amount_eur"`
		CloseEUR  float64 `json:"close_amount_eur"`
		Comm      float64 `json:"commission_eur"`
		GainEUR   float64 `json:"gain_eur"`
	}

	totals := map[string]*yearTotals{}
	yearTotal := func(year string) *yearTotals {
		if totals[year] == nil {
			totals[year] = &yearTotals{}
		}
		return totals[year]
	}

	stocks := []stockSale{}
	for _, sale := range stockSales {
		if !matchesYear(sale.SaleDate, in.Year) || (in.ISIN != "" && !strings.EqualFold(sale.ISIN, in.ISIN)) {
			continue
		}
		t := yearTotal(yearOf(sale.SaleDate))
		t.StockProceedsEUR += sale.SaleAmountEUR
		t.StockCostEUR += math.Abs(sale.BuyAmountEUR)
		t.StockCommissions += sale.Commission
		t.StockGainEUR += sale.Delta
		t.TotalGainEUR += sale.Delta
		t.StockSalesCount++
		stocks = append(stocks, stockSale{
			Name:        sale.ProductName,
			ISIN:        sale.ISIN,
			Country:     strings.TrimSpace(sale.CountryCode),
			BuyDate:     sale.BuyDate,
			SaleDate:    sale.SaleDate,
			Quantity:    sale.Quantity,
			BuyPrice:    sale.BuyPrice,
			BuyCurrency: sale.BuyCurrency,
			SalePrice:   sale.SalePrice,
			SaleCurr:    sale.SaleCurrency,
			CostEUR:     round2(math.Abs(sale.BuyAmountEUR)),
			ProceedsEUR: round2(sale.SaleAmountEUR),
			Commission:  round2(sale.Commission),
			GainEUR:     round2(sale.Delta),
		})
	}

	options := []optionClose{}
	if in.ISIN == "" {
		for _, o := range optionSales {
			if !matchesYear(o.CloseDate, in.Year) {
				continue
			}
			t := yearTotal(yearOf(o.CloseDate))
			t.OptionGainEUR += o.Delta
			t.TotalGainEUR += o.Delta
			t.OptionClosesCount++
			options = append(options, optionClose{
				Name:      o.ProductName,
				OpenDate:  o.OpenDate,
				CloseDate: o.CloseDate,
				Quantity:  o.Quantity,
				OpenEUR:   round2(o.OpenAmountEUR),
				CloseEUR:  round2(o.CloseAmountEUR),
				Comm:      round2(o.Commission),
				GainEUR:   round2(o.Delta),
			})
		}
	}

	unmatchedSales := []models.UnmatchedSale{}
	for _, u := range unmatched {
		if matchesYear(u.SaleDate, in.Year) && (in.ISIN == "" || strings.EqualFold(u.ISIN, in.ISIN)) {
			u.SaleAmountEUR = round2(u.SaleAmountEUR)
			unmatchedSales = append(unmatchedSales, u)
		}
	}

	for _, t := range totals {
		t.StockProceedsEUR = round2(t.StockProceedsEUR)
		t.StockCostEUR = round2(t.StockCostEUR)
		t.StockCommissions = round2(t.StockCommissions)
		t.StockGainEUR = round2(t.StockGainEUR)
		t.OptionGainEUR = round2(t.OptionGainEUR)
		t.TotalGainEUR = round2(t.TotalGainEUR)
	}
	sort.SliceStable(stocks, func(i, j int) bool { return dateKey(stocks[i].SaleDate) > dateKey(stocks[j].SaleDate) })
	sort.SliceStable(options, func(i, j int) bool { return dateKey(options[i].CloseDate) > dateKey(options[j].CloseDate) })

	result := map[string]any{
		"portfolio":                p,
		"totals_by_year":           totals,
		"sales_without_a_purchase": unmatchedSales,
		"note":                     "gain_eur is proceeds minus cost, as VisorFinanceiro shows it; commission_eur is the commission of that sale and its purchase",
	}
	// Every sale of every year is too much to answer with at once.
	if in.Year != 0 || in.ISIN != "" {
		result["stock_sales"] = stocks
		result["option_closes"] = options
	} else {
		result["details"] = "only the totals are listed; pass a year or an isin to get the individual sales"
	}
	return nil, result, nil
}

func (s *Server) getDividends(_ context.Context, _ *mcp.CallToolRequest, in dividendsInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	summary, err := s.uploads.GetDividendTaxSummary(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the dividends: %w", err)
	}

	type countryTotals struct {
		GrossEUR    float64 `json:"gross_eur"`
		WithheldEUR float64 `json:"tax_withheld_eur"`
	}
	type yearSummary struct {
		GrossEUR    float64                  `json:"gross_eur"`
		WithheldEUR float64                  `json:"tax_withheld_eur"`
		NetEUR      float64                  `json:"net_eur"`
		ByCountry   map[string]countryTotals `json:"by_country"`
	}
	years := map[string]yearSummary{}
	for year, countries := range summary {
		if in.Year != 0 && year != fmt.Sprint(in.Year) {
			continue
		}
		ys := yearSummary{ByCountry: map[string]countryTotals{}}
		for country, amounts := range countries {
			// Withholding tax is stored as a negative amount.
			withheld := math.Abs(amounts.TaxedAmt)
			ys.GrossEUR += amounts.GrossAmt
			ys.WithheldEUR += withheld
			ys.ByCountry[strings.TrimSpace(country)] = countryTotals{GrossEUR: round2(amounts.GrossAmt), WithheldEUR: round2(withheld)}
		}
		ys.NetEUR = round2(ys.GrossEUR - ys.WithheldEUR)
		ys.GrossEUR = round2(ys.GrossEUR)
		ys.WithheldEUR = round2(ys.WithheldEUR)
		years[year] = ys
	}

	result := map[string]any{"portfolio": p, "by_year": years}

	if metrics, err := s.uploads.GetDividendMetrics(s.userID, p.ID); err != nil {
		result["metrics_error"] = err.Error()
	} else if metrics != nil && metrics.HasData {
		type monthAmount struct {
			Month     string  `json:"month"`
			AmountEUR float64 `json:"amount_eur"`
		}
		projection := []monthAmount{}
		var projectedTotal float64
		for i, amount := range metrics.ProjectionByMonth {
			if i < 12 {
				projection = append(projection, monthAmount{Month: time.Month(i + 1).String(), AmountEUR: round2(amount)})
				projectedTotal += amount
			}
		}
		yearlyYields := map[string]float64{}
		for year, yield := range metrics.YearlyYields {
			yearlyYields[year] = round2(yield)
		}
		result["metrics"] = map[string]any{
			"trailing_12_months_eur":       round2(metrics.TotalDividendsTTM),
			"portfolio_yield_pct":          round2(metrics.PortfolioYield),
			"yield_on_cost_pct":            round2(metrics.YieldOnCost),
			"projected_next_12_months_eur": round2(projectedTotal),
			"projection_by_month":          projection,
			"yield_by_year_pct":            yearlyYields,
			"note":                         "the projection repeats the last year's dividends of the shares held now",
		}
	}

	if in.IncludePayments {
		transactions, err := s.uploads.GetDividendTransactions(s.userID, p.ID)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read the dividend payments: %w", err)
		}
		type payment struct {
			Date      string  `json:"date"`
			Name      string  `json:"name"`
			ISIN      string  `json:"isin,omitempty"`
			Kind      string  `json:"kind"`
			Amount    float64 `json:"amount"`
			Currency  string  `json:"currency"`
			AmountEUR float64 `json:"amount_eur"`
		}
		payments := []payment{}
		for _, t := range transactions {
			if !matchesYear(t.Date, in.Year) {
				continue
			}
			kind := "dividend"
			if t.TransactionSubType == "TAX" {
				kind = "withholding tax"
			}
			payments = append(payments, payment{
				Date: t.Date, Name: t.ProductName, ISIN: t.ISIN, Kind: kind,
				Amount: round2(t.Amount), Currency: t.Currency, AmountEUR: round2(t.AmountEUR),
			})
		}
		sort.SliceStable(payments, func(i, j int) bool { return dateKey(payments[i].Date) > dateKey(payments[j].Date) })
		result["payments"] = payments
	}

	return nil, result, nil
}

func (s *Server) getFees(_ context.Context, _ *mcp.CallToolRequest, in yearInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	fees, err := s.uploads.GetFeeDetails(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the fees: %w", err)
	}

	byYear := map[string]map[string]float64{}
	list := []models.FeeDetail{}
	for _, f := range fees {
		if !matchesYear(f.Date, in.Year) {
			continue
		}
		year := yearOf(f.Date)
		if byYear[year] == nil {
			byYear[year] = map[string]float64{}
		}
		category := f.Category
		if category == "" {
			category = "other"
		}
		byYear[year][category] += f.AmountEUR
		byYear[year]["total"] += f.AmountEUR
		f.AmountEUR = round2(f.AmountEUR)
		list = append(list, f)
	}
	for _, categories := range byYear {
		for category, amount := range categories {
			categories[category] = round2(amount)
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return dateKey(list[i].Date) > dateKey(list[j].Date) })
	total := len(list)
	if total > maxFeesListed {
		list = list[:maxFeesListed]
	}

	return nil, map[string]any{
		"portfolio":          p,
		"totals_by_year_eur": byYear,
		"fees_count":         total,
		"fees":               list,
		"note":               fmt.Sprintf("costs are negative amounts, refunds positive; only the newest %d fees are listed, the totals include them all", maxFeesListed),
	}, nil
}

func (s *Server) getPerformanceHistory(_ context.Context, _ *mcp.CallToolRequest, in historyInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	interval := strings.ToLower(strings.TrimSpace(in.Interval))
	if interval == "" {
		interval = "monthly"
	}
	if interval != "daily" && interval != "weekly" && interval != "monthly" {
		return nil, nil, fmt.Errorf("interval must be daily, weekly or monthly, not %q", in.Interval)
	}
	for _, date := range []string{in.From, in.To} {
		if date != "" {
			if _, err := time.Parse("2006-01-02", date); err != nil {
				return nil, nil, fmt.Errorf("dates must be YYYY-MM-DD, not %q", date)
			}
		}
	}

	history, err := s.uploads.GetHistoricalChartData(s.userID, p.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the history: %w", err)
	}

	type point struct {
		Date              string  `json:"date"`
		ValueEUR          float64 `json:"value_eur"`
		NetDepositedEUR   float64 `json:"net_deposited_eur"`
		GainEUR           float64 `json:"gain_eur"`
		CashEUR           float64 `json:"cash_eur"`
		BenchmarkValueEUR float64 `json:"sp500_benchmark_value,omitempty"`
	}
	// The snapshots are sorted by date, so the last one of each period is the one kept.
	points := []point{}
	lastPeriod := ""
	for _, h := range history {
		if (in.From != "" && h.Date < in.From) || (in.To != "" && h.Date > in.To) {
			continue
		}
		item := point{
			Date:              h.Date,
			ValueEUR:          round2(h.PortfolioValue),
			NetDepositedEUR:   round2(h.CumulativeCashFlow),
			GainEUR:           round2(h.PortfolioValue - h.CumulativeCashFlow),
			CashEUR:           round2(h.CashBalance),
			BenchmarkValueEUR: round2(h.BenchmarkValue),
		}
		period := periodOf(h.Date, interval)
		if period == lastPeriod && len(points) > 0 {
			points[len(points)-1] = item
		} else {
			points = append(points, item)
		}
		lastPeriod = period
	}

	result := map[string]any{
		"portfolio": p,
		"interval":  interval,
		"points":    points,
		"note": "gain_eur is the value minus the net amount deposited. sp500_benchmark_value buys SPY with each deposit, " +
			"as the app's chart does, with SPY's price converted to EUR at each day's USD/EUR rate.",
	}
	if len(points) == 0 {
		result["note"] = "There are no snapshots for this period. They are created when the portfolio is opened in VisorFinanceiro."
	}
	return nil, result, nil
}

func (s *Server) getTransactions(ctx context.Context, _ *mcp.CallToolRequest, in transactionsInput) (*mcp.CallToolResult, any, error) {
	p, err := s.portfolio(in.PortfolioID)
	if err != nil {
		return nil, nil, err
	}
	limit := in.Limit
	if limit <= 0 {
		limit = defaultTransactionLimit
	}
	if limit > maxTransactionLimit {
		limit = maxTransactionLimit
	}

	query := `
		SELECT date, source, product_name, isin, quantity, price, transaction_type, transaction_subtype,
		       buy_sell, description, amount, currency, commission, amount_eur
		FROM processed_transactions
		WHERE user_id = ? AND portfolio_id = ?`
	args := []any{s.userID, p.ID}
	if in.Year != 0 {
		query += " AND date LIKE ?"
		args = append(args, fmt.Sprintf("%%-%04d", in.Year))
	}
	if in.Type != "" {
		query += " AND UPPER(transaction_type) = ?"
		args = append(args, strings.ToUpper(strings.TrimSpace(in.Type)))
	}
	if in.ISIN != "" {
		query += " AND UPPER(isin) = ?"
		args = append(args, strings.ToUpper(strings.TrimSpace(in.ISIN)))
	}
	if in.Search != "" {
		query += " AND (product_name LIKE ? OR description LIKE ?)"
		pattern := "%" + in.Search + "%"
		args = append(args, pattern, pattern)
	}

	rows, err := database.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read the transactions: %w", err)
	}
	defer rows.Close()

	transactions := []transaction{}
	for rows.Next() {
		var t transaction
		if err := rows.Scan(&t.Date, &t.Broker, &t.Name, &t.ISIN, &t.Quantity, &t.Price, &t.Type, &t.SubType,
			&t.BuySell, &t.Description, &t.Amount, &t.Currency, &t.Commission, &t.AmountEUR); err != nil {
			return nil, nil, fmt.Errorf("failed to read the transactions: %w", err)
		}
		t.AmountEUR = round2(t.AmountEUR)
		transactions = append(transactions, t)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("failed to read the transactions: %w", err)
	}

	// Dates are stored as DD-MM-YYYY, which doesn't sort as text.
	sort.SliceStable(transactions, func(i, j int) bool {
		return dateKey(transactions[i].Date) > dateKey(transactions[j].Date)
	})
	total := len(transactions)
	if total > limit {
		transactions = transactions[:limit]
	}

	return nil, map[string]any{
		"portfolio":    p,
		"matching":     total,
		"returned":     len(transactions),
		"transactions": transactions,
	}, nil
}

// transaction is a transaction as get_transactions returns it.
type transaction struct {
	Date        string  `json:"date"`
	Broker      string  `json:"broker"`
	Name        string  `json:"name"`
	ISIN        string  `json:"isin,omitempty"`
	Type        string  `json:"type"`
	SubType     string  `json:"subtype,omitempty"`
	BuySell     string  `json:"buy_sell,omitempty"`
	Quantity    float64 `json:"quantity,omitempty"`
	Price       float64 `json:"price,omitempty"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	AmountEUR   float64 `json:"amount_eur"`
	Commission  float64 `json:"commission,omitempty"`
	Description string  `json:"description,omitempty"`
}

// --- Helpers ---

func boolPtr(b bool) *bool { return &b }

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func round4(v float64) float64 { return math.Round(v*10000) / 10000 }

// percent returns part as a percentage of whole, or 0 when whole is 0.
func percent(part, whole float64) float64 {
	if whole == 0 {
		return 0
	}
	return round2(part / whole * 100)
}

// parseDate reads a DD-MM-YYYY date.
func parseDate(date string) (time.Time, bool) {
	t, err := time.Parse("02-01-2006", date)
	return t, err == nil
}

// dateKey turns a DD-MM-YYYY date into YYYY-MM-DD, which sorts as text.
func dateKey(date string) string {
	if t, ok := parseDate(date); ok {
		return t.Format("2006-01-02")
	}
	return date
}

// yearOf returns the year of a DD-MM-YYYY date.
func yearOf(date string) string {
	if t, ok := parseDate(date); ok {
		return t.Format("2006")
	}
	return "unknown"
}

func matchesYear(date string, year int) bool {
	return year == 0 || yearOf(date) == fmt.Sprint(year)
}

// periodOf returns the day, ISO week or month of a YYYY-MM-DD date.
func periodOf(date, interval string) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	switch interval {
	case "weekly":
		year, week := t.ISOWeek()
		return fmt.Sprintf("%d-W%02d", year, week)
	case "monthly":
		return t.Format("2006-01")
	default:
		return date
	}
}
