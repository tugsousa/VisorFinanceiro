package services

import (
	"errors"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
)

func TestSimulateStockSales_TotalTaxIsNotTheSumOfEach(t *testing.T) {
	setupHistoryTestDB(t)
	service := newTaxTestService()
	insertStockTrade(t, "01-02-2020", "X", "BUY", 10, 100, "1")
	insertStockTrade(t, "01-02-2020", "Y", "BUY", 10, 100, "2")

	// X sold with a gain of 500 and Y with a loss of 300, on a year with nothing else.
	batch, err := service.simulateStockSales(1, 1, []SaleSimulationRequest{
		{ISIN: "X", Quantity: 10, PriceEUR: 150},
		{ISIN: "Y", Quantity: 10, PriceEUR: 70},
	})
	if err != nil {
		t.Fatalf("simulateStockSales failed: %v", err)
	}
	x, y := batch.Sales[0], batch.Sales[1]
	if x.ISIN != "X" || x.Gain != 500 || y.ISIN != "Y" || y.Gain != -300 {
		t.Fatalf("gains: X %+v, Y %+v", x, y)
	}
	// Alone, X pays 28% of 500 and Y nothing (a negative balance pays no tax).
	if x.MarginalTax != 140 || y.MarginalTax != 0 {
		t.Errorf("tax of each sale alone: X %v, Y %v; want 140 and 0", x.MarginalTax, y.MarginalTax)
	}
	// Together the loss offsets the gain: 28% of 200.
	if batch.MarginalTax != 56 || batch.YearAfter.Balance-batch.YearBefore.Balance != 200 {
		t.Errorf("joint tax %v on a balance change of %v; want 56 on 200", batch.MarginalTax, batch.YearAfter.Balance-batch.YearBefore.Balance)
	}

	// Each sale simulated alone gives what it gives in the batch.
	single, err := service.SimulateStockSale(1, 1, SaleSimulationRequest{ISIN: "X", Quantity: 10, PriceEUR: 150})
	if err != nil {
		t.Fatal(err)
	}
	if single.Gain != x.Gain || single.MarginalTax != x.MarginalTax || single.YearAfter.Balance != x.YearAfter.Balance || len(single.Lots) != len(x.Lots) {
		t.Errorf("X alone %+v differs from X in the batch %+v", single, x)
	}

	if _, err := service.simulateStockSales(1, 1, []SaleSimulationRequest{{ISIN: "X", Quantity: 1}, {ISIN: "X", Quantity: 1}}); !errors.Is(err, ErrSimulationInput) {
		t.Errorf("two sales of the same ISIN should be refused, got %v", err)
	}
	empty, err := service.simulateStockSales(1, 1, nil)
	if err != nil || len(empty.Sales) != 0 || empty.MarginalTax != 0 || empty.YearAfter != empty.YearBefore {
		t.Errorf("no sales: %+v, %v", empty, err)
	}
}

func TestAllocation_RebalancePlan(t *testing.T) {
	service := setupAllocationTest(t)

	if _, err := service.PlanAllocationRebalance(1, 1); !errors.Is(err, ErrAllocationInput) {
		t.Errorf("without groups there's nothing to rebalance, got %v", err)
	}

	groups, err := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "Ações", TargetPct: 60}, {Name: "Obrigações", TargetPct: 40}})
	if err != nil {
		t.Fatal(err)
	}
	shares, bonds := groupByName(t, groups, "Ações"), groupByName(t, groups, "Obrigações")
	holdings := []AllocationAssignment{{ISIN: "X", GroupID: shares.ID}, {ISIN: "BOND", GroupID: bonds.ID}}
	if err := service.SaveAllocationAssignments(1, 1, holdings); err != nil {
		t.Fatal(err)
	}

	salesBefore, _ := service.GetStockSaleDetails(1, 1)
	lotsBefore, _ := service.currentLotsByISIN(1, 1)
	var rowsBefore int
	database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions").Scan(&rowsBefore)

	plan, err := service.PlanAllocationRebalance(1, 1)
	if err != nil {
		t.Fatalf("PlanAllocationRebalance failed: %v", err)
	}
	// 3000 of X (75%) against 60%: 6 X at 100 sold. They cost 90 each: a gain of 60, taxed at 28%.
	if len(plan.Sales) != 1 {
		t.Fatalf("sales = %+v", plan.Sales)
	}
	sale := plan.Sales[0]
	if sale.ISIN != "X" || sale.Quantity != 6 || sale.SaleAmountEUR != 600 || sale.Gain != 60 || sale.GroupID != shares.ID || sale.HeldQuantity != 30 {
		t.Errorf("sale = %+v", sale)
	}
	if plan.TotalSaleEUR != 600 || plan.TotalGain != 60 || plan.TotalTaxEUR != 16.8 || sale.MarginalTax != 16.8 || plan.ShortTermGain != 0 {
		t.Errorf("totals: sale %v, gain %v, tax %v", plan.TotalSaleEUR, plan.TotalGain, plan.TotalTaxEUR)
	}
	// The 600 buy 12 BOND at 50, and both groups end on target.
	buy := plan.Lines[1]
	if buy.BuyAsset == nil || buy.BuyAsset.ISIN != "BOND" || buy.BuyShares != 12 || buy.BuyCostEUR != 600 || buy.PctAfter != 40 {
		t.Errorf("buying line = %+v", buy)
	}
	if !plan.ReachesTargets || plan.UnsoldEUR != 0 || plan.BoughtEUR != 600 || plan.TotalAfterEUR != 4000 {
		t.Errorf("plan = %+v", plan)
	}

	// It's a simulation: no transaction, sale or lot changed.
	salesAfter, _ := service.GetStockSaleDetails(1, 1)
	lotsAfter, _ := service.currentLotsByISIN(1, 1)
	var rowsAfter int
	database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions").Scan(&rowsAfter)
	if len(salesAfter) != len(salesBefore) || rowsAfter != rowsBefore || lotsAfter["X"][0].Quantity != lotsBefore["X"][0].Quantity {
		t.Errorf("the plan changed the real data: %d → %d sales, %d → %d rows", len(salesBefore), len(salesAfter), rowsBefore, rowsAfter)
	}

	// Another user can't plan on this portfolio.
	if _, err := service.PlanAllocationRebalance(2, 1); !errors.Is(err, ErrAllocationPortfolioNotFound) {
		t.Errorf("planning on the portfolio of another user: %v", err)
	}
}

func TestAllocation_RebalancePlanNeverSellsWhatIsOutsideTheBroker(t *testing.T) {
	service := setupAllocationTest(t)
	groups, _ := service.SaveAllocationGroups(1, 1, []AllocationGroup{{Name: "Ações", TargetPct: 80}, {Name: "Seguro", TargetPct: 20}})
	shares, safe := groupByName(t, groups, "Ações"), groupByName(t, groups, "Seguro")
	aforro := addOtherAsset(t, 1, "savings_certificate", "Certificados de Aforro", 6000)
	err := service.SaveAllocationAssignmentsAndOtherAssets(1, 1,
		[]AllocationAssignment{{ISIN: "X", GroupID: shares.ID}, {ISIN: "BOND", GroupID: safe.ID}},
		[]AllocationOtherAssignment{{OtherAssetID: aforro, GroupID: safe.ID}})
	if err != nil {
		t.Fatal(err)
	}

	plan, err := service.PlanAllocationRebalance(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	// Total 10 000: "Seguro" holds 7000 against 2000. Only its 1000 of BOND can be sold.
	line := plan.Lines[1]
	if line.ExcessEUR != 5000 || line.SoldEUR != 1000 || line.UnsoldEUR != 4000 || line.UnsoldReason != UnsoldOutsideBroker {
		t.Errorf("line of the group with assets outside the broker = %+v", line)
	}
	if len(plan.Sales) != 1 || plan.Sales[0].ISIN != "BOND" || plan.Sales[0].Quantity != 20 {
		t.Errorf("only BOND can be sold: %+v", plan.Sales)
	}
	// BOND cost 45 and is sold at 50: 20 × 5 = 100 of gain.
	if plan.TotalGain != 100 || plan.TotalTaxEUR != 28 || plan.ReachesTargets || plan.UnsoldEUR != 4000 {
		t.Errorf("plan = %+v", plan)
	}
	if buy := plan.Lines[0]; buy.BuyAsset == nil || buy.BuyAsset.ISIN != "X" || buy.BuyShares != 10 {
		t.Errorf("buying line = %+v", buy)
	}
}
