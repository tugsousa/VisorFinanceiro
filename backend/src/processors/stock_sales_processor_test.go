package processors

import (
	"testing"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

func stockTx(date, buySell string, quantity, amountEUR, commission float64) models.ProcessedTransaction {
	return models.ProcessedTransaction{
		Date: date, Source: "ibkr", ProductName: "ACME", ISIN: "US0000000001", TransactionType: "STOCK", BuySell: buySell,
		Quantity: quantity, OriginalQuantity: quantity, Amount: amountEUR, AmountEUR: amountEUR, ExchangeRate: 1, Commission: commission,
	}
}

func setupStockTest(t *testing.T) {
	t.Helper()
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
}

func TestStockProcessor_SplitsBuyCommissionAcrossPartialSales(t *testing.T) {
	setupStockTest(t)

	details, _ := NewStockProcessor().Process([]models.ProcessedTransaction{
		stockTx("10-01-2024", "BUY", 10, -1000, 5),
		stockTx("10-06-2024", "SELL", 4, 500, 0),
		stockTx("10-02-2025", "SELL", 6, 900, 0),
	})

	if len(details) != 2 {
		t.Fatalf("expected 2 matched lots, got %d", len(details))
	}
	assertAmount(t, "buy commission of the first year", 2, details[0].BuyCommission)
	assertAmount(t, "buy commission of the second year", 3, details[1].BuyCommission)
}

func TestStockProcessor_KeepsFractionalQuantities(t *testing.T) {
	setupStockTest(t)
	txs := []models.ProcessedTransaction{
		stockTx("10-01-2024", "BUY", 0.5, -100, 0),
		stockTx("10-06-2024", "SELL", 0.5, 150, 0),
	}

	details, holdings := NewStockProcessor().Process(txs)

	if len(details) != 1 {
		t.Fatalf("expected 1 matched lot, got %d", len(details))
	}
	assertAmount(t, "quantity", 0.5, details[0].Quantity)
	assertAmount(t, "gain", 50, details[0].Delta)
	if lots := holdings["2024"]; len(lots) != 0 {
		t.Errorf("expected no open lots, got %+v", lots)
	}
	if unmatched := NewStockProcessor().FindUnmatchedSales(txs); len(unmatched) != 0 {
		t.Errorf("expected no unmatched sales, got %+v", unmatched)
	}
}

// 0.3 - 0.1 - 0.2 isn't exactly 0 in floating point, which must not leave a lot open.
func TestStockProcessor_FloatRemainderDoesNotLeaveALotOpen(t *testing.T) {
	setupStockTest(t)
	txs := []models.ProcessedTransaction{
		stockTx("10-01-2024", "BUY", 0.3, -30, 0),
		stockTx("10-02-2024", "SELL", 0.1, 11, 0),
		stockTx("10-03-2024", "SELL", 0.2, 22, 0),
	}

	_, holdings := NewStockProcessor().Process(txs)

	if lots := holdings["2024"]; len(lots) != 0 {
		t.Errorf("expected no open lots, got %+v", lots)
	}
	if unmatched := NewStockProcessor().FindUnmatchedSales(txs); len(unmatched) != 0 {
		t.Errorf("expected no unmatched sales, got %+v", unmatched)
	}
}

func TestStockProcessor_ReportsSoldQuantityWithoutPurchase(t *testing.T) {
	setupStockTest(t)
	txs := []models.ProcessedTransaction{
		stockTx("10-01-2024", "BUY", 3, -300, 0),
		stockTx("10-06-2024", "SELL", 5, 1000, 0),
	}

	details, _ := NewStockProcessor().Process(txs)
	unmatched := NewStockProcessor().FindUnmatchedSales(txs)

	if len(details) != 1 {
		t.Fatalf("expected 1 matched lot, got %d", len(details))
	}
	assertAmount(t, "matched quantity", 3, details[0].Quantity)
	assertAmount(t, "matched proceeds", 600, details[0].SaleAmountEUR)

	if len(unmatched) != 1 {
		t.Fatalf("expected 1 unmatched sale, got %d", len(unmatched))
	}
	assertAmount(t, "unmatched quantity", 2, unmatched[0].Quantity)
	assertAmount(t, "unmatched proceeds", 400, unmatched[0].SaleAmountEUR)
	if unmatched[0].SaleDate != "10-06-2024" || unmatched[0].ISIN != "US0000000001" {
		t.Errorf("unexpected unmatched sale: %+v", unmatched[0])
	}
}

func TestFindUnmatchedSales_NoTransactions(t *testing.T) {
	setupStockTest(t)
	if unmatched := NewStockProcessor().FindUnmatchedSales(nil); unmatched == nil || len(unmatched) != 0 {
		t.Errorf("expected an empty list for the API, got %#v", unmatched)
	}
}
