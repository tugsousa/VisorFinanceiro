package services

import (
	"testing"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/processors"
)

// harvestPriceStub prices L at 60, M at 90 and W at 200; N has no price.
type harvestPriceStub struct{ historyPriceStub }

func (harvestPriceStub) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	return map[string]PriceInfo{
		"L": {Status: "OK", Price: 60, Currency: "EUR"},
		"M": {Status: "OK", Price: 90, Currency: "EUR"},
		"W": {Status: "OK", Price: 200, Currency: "EUR"},
	}, nil
}

func TestPlanTaxLossHarvest_SellsLossesUpToTheBalance(t *testing.T) {
	setupHistoryTestDB(t)
	service := NewUploadService(
		processors.NewTransactionProcessor(), processors.NewDividendProcessor(), processors.NewStockProcessor(),
		processors.NewOptionProcessor(), processors.NewCashMovementProcessor(), processors.NewFeeProcessor(),
		harvestPriceStub{}, cache.New(DefaultCacheExpiration, CacheCleanupInterval),
	).(*uploadServiceImpl)

	// A gain of 500 this year on G.
	insertStockTrade(t, "01-01-2021", "G", "BUY", 10, 100, "1")
	insertStockTrade(t, daysAgo(0), "G", "SELL", 10, 150, "2")
	// L: 10 shares bought at 100, now 60 → −400 (more loss per euro sold than M).
	insertStockTrade(t, "01-01-2022", "L", "BUY", 10, 100, "3")
	// M: 20 shares at 100, then 10 at 80; now 90 → the first lot −200, the second +100.
	insertStockTrade(t, "01-01-2022", "M", "BUY", 20, 100, "4")
	insertStockTrade(t, "01-06-2022", "M", "BUY", 10, 80, "5")
	// W at a gain, N without a price.
	insertStockTrade(t, "01-01-2022", "W", "BUY", 1, 100, "6")
	insertStockTrade(t, "01-01-2022", "N", "BUY", 1, 100, "7")

	plan, err := service.PlanTaxLossHarvest(1, 1, 0)
	if err != nil {
		t.Fatalf("PlanTaxLossHarvest failed: %v", err)
	}

	// The balance is 500: all of L (−400), then 10 of M's first 20 shares (−100) bring it to zero.
	if len(plan.Sales) != 2 {
		t.Fatalf("sales = %+v, want L and M", plan.Sales)
	}
	l, m := plan.Sales[0], plan.Sales[1]
	if l.ISIN != "L" || l.Quantity != 10 || l.Gain != -400 {
		t.Errorf("first sale = %s %v shares, gain %v; want L 10, −400", l.ISIN, l.Quantity, l.Gain)
	}
	if m.ISIN != "M" || m.Quantity != 10 || m.Gain != -100 {
		t.Errorf("second sale = %s %v shares, gain %v; want M 10, −100", m.ISIN, m.Quantity, m.Gain)
	}
	if plan.YearBefore.Balance != 500 || plan.YearAfter.Balance != 0 || plan.TaxSaved != 140 {
		t.Errorf("balance %v → %v, tax saved %v; want 500 → 0, 140", plan.YearBefore.Balance, plan.YearAfter.Balance, plan.TaxSaved)
	}
	if plan.TotalLoss != -500 || plan.TotalSale != 1500 {
		t.Errorf("total loss %v, sale %v; want −500, 1500", plan.TotalLoss, plan.TotalSale)
	}
	if plan.UnusedLoss != -100 {
		t.Errorf("unused loss = %v, want −100 (the other 10 shares of M's first lot)", plan.UnusedLoss)
	}
	if len(plan.Skipped) != 1 || plan.Skipped[0].ISIN != "N" || plan.Skipped[0].Reason != "no_price" {
		t.Errorf("skipped = %+v, want N without a price", plan.Skipped)
	}

	// Nothing was stored: the real balance is still 500.
	again, err := service.PlanTaxLossHarvest(1, 1, 0)
	if err != nil || again.YearBefore.Balance != 500 {
		t.Errorf("second call: balance %v, err %v; want 500", again.YearBefore.Balance, err)
	}
}

func TestPlanTaxLossHarvest_NothingWhenTheYearHasNoTax(t *testing.T) {
	setupHistoryTestDB(t)
	service := NewUploadService(
		processors.NewTransactionProcessor(), processors.NewDividendProcessor(), processors.NewStockProcessor(),
		processors.NewOptionProcessor(), processors.NewCashMovementProcessor(), processors.NewFeeProcessor(),
		harvestPriceStub{}, cache.New(DefaultCacheExpiration, CacheCleanupInterval),
	).(*uploadServiceImpl)
	insertStockTrade(t, "01-01-2022", "L", "BUY", 10, 100, "1")

	plan, err := service.PlanTaxLossHarvest(1, 1, 0)
	if err != nil {
		t.Fatalf("PlanTaxLossHarvest failed: %v", err)
	}
	if len(plan.Sales) != 0 || plan.TaxSaved != 0 {
		t.Errorf("sales = %+v, tax saved %v; want none", plan.Sales, plan.TaxSaved)
	}
}
