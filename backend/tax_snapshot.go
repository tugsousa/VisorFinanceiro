package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
)

// runTaxSnapshot ("VisorFinanceiro.exe tax-snapshot <file.json>") writes everything the IRS page
// receives from the backend, for every portfolio, to a JSON file. Comparing a file written before a
// change with one written after it shows whether the change moved any value on that page.
func runTaxSnapshot(outPath string) error {
	prepareMCPRuntime()
	initCore()

	userID, err := mcpUserID(security.NewAuthService(config.Cfg.JWTSecret))
	if err != nil {
		return fmt.Errorf("could not find the account to use: %w", err)
	}

	reportCache := cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval)
	uploads := newUploadService(services.NewPriceService(), reportCache)

	rows, err := database.DB.Query("SELECT id, name FROM portfolios WHERE user_id = ? ORDER BY id", userID)
	if err != nil {
		return fmt.Errorf("failed to read the portfolios: %w", err)
	}
	type portfolio struct {
		id   int64
		name string
	}
	var portfolios []portfolio
	for rows.Next() {
		var p portfolio
		if err := rows.Scan(&p.id, &p.name); err != nil {
			rows.Close()
			return fmt.Errorf("failed to read the portfolios: %w", err)
		}
		portfolios = append(portfolios, p)
	}
	rows.Close()

	snapshot := []map[string]any{}
	for _, p := range portfolios {
		stockSales, err := uploads.GetStockSaleDetails(userID, p.id)
		if err != nil {
			return fmt.Errorf("stock sales of %q: %w", p.name, err)
		}
		unmatched, err := uploads.GetUnmatchedStockSales(userID, p.id)
		if err != nil {
			return fmt.Errorf("unmatched sales of %q: %w", p.name, err)
		}
		optionSales, err := uploads.GetOptionSaleDetails(userID, p.id)
		if err != nil {
			return fmt.Errorf("option sales of %q: %w", p.name, err)
		}
		dividendSummary, err := uploads.GetDividendTaxSummary(userID, p.id)
		if err != nil {
			return fmt.Errorf("dividend summary of %q: %w", p.name, err)
		}
		dividendTxs, err := uploads.GetDividendTransactions(userID, p.id)
		if err != nil {
			return fmt.Errorf("dividend transactions of %q: %w", p.name, err)
		}
		snapshot = append(snapshot, map[string]any{
			"portfolio_id":          p.id,
			"portfolio_name":        p.name,
			"stock_sales":           stockSales,
			"unmatched_stock_sales": unmatched,
			"option_sales":          optionSales,
			"dividend_tax_summary":  dividendSummary,
			"dividend_transactions": dividendTxs,
		})
	}

	content, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(outPath, content, 0o600)
}
