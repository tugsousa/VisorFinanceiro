package services

import (
	"math"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
)

func insertCashTx(t *testing.T, date, source, txType, buySell string, amountEUR, commission, balance float64) {
	t.Helper()
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, source, transaction_type, buy_sell, amount_eur, commission, cash_balance, balance_currency)
		VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, 'EUR')`, date, source, txType, buySell, amountEUR, commission, balance)
	if err != nil {
		t.Fatalf("failed to insert transaction: %v", err)
	}
}

func assertSnapshotCash(t *testing.T, date string, want float64) {
	t.Helper()
	var got float64
	err := database.DB.QueryRow(`SELECT cash_balance FROM portfolio_snapshots WHERE date = ?`, date).Scan(&got)
	if err != nil {
		t.Fatalf("failed to read snapshot of %s: %v", date, err)
	}
	if math.Abs(got-want) > 0.001 {
		t.Errorf("cash on %s: expected %v, got %v", date, want, got)
	}
}

func TestGetCurrentCashBalance_CountsIBKRCashFromItsTrades(t *testing.T) {
	setupHistoryTestDB(t)
	service := &uploadServiceImpl{}

	insertCashTx(t, "10-01-2025", "ibkr", "CASH", "", 10000, 0, 0)
	insertCashTx(t, "11-01-2025", "ibkr", "STOCK", "BUY", -5000, 2, 0)
	insertCashTx(t, "12-01-2025", "ibkr", "STOCK", "SELL", 1000, 1, 0)

	cash, err := service.GetCurrentCashBalance(1, 1)
	if err != nil {
		t.Fatalf("GetCurrentCashBalance returned error: %v", err)
	}
	if math.Abs(cash-5997) > 0.001 {
		t.Errorf("expected 5997, got %v", cash)
	}
}

// A balance reported by DeGiro must not replace the cash held at the other broker.
func TestCash_IsTrackedPerBroker(t *testing.T) {
	setupHistoryTestDB(t)
	service := &uploadServiceImpl{priceService: historyPriceStub{}}

	insertCashTx(t, "10-01-2025", "ibkr", "CASH", "", 1000, 0, 0)
	insertCashTx(t, "11-01-2025", "degiro", "CASH", "", 500, 0, 500)
	if err := service.RebuildUserHistory(1, 1); err != nil {
		t.Fatalf("full rebuild failed: %v", err)
	}
	assertSnapshotCash(t, "2025-01-11", 1500)

	// An incremental rebuild has to reach the same result from the earlier transactions.
	insertCashTx(t, "20-01-2025", "ibkr", "STOCK", "BUY", -100, 0, 0)
	if err := service.RebuildUserHistoryFrom(1, 1, "20-01-2025"); err != nil {
		t.Fatalf("incremental rebuild failed: %v", err)
	}
	assertSnapshotCash(t, "2025-01-19", 1500)
	assertSnapshotCash(t, "2025-01-20", 1400)

	cash, err := service.GetCurrentCashBalance(1, 1)
	if err != nil {
		t.Fatalf("GetCurrentCashBalance returned error: %v", err)
	}
	if math.Abs(cash-1400) > 0.001 {
		t.Errorf("expected the current cash to match the history, got %v", cash)
	}
}

func TestCash_DeGiroTradeBalanceIsNotTrusted(t *testing.T) {
	cash := cashBalances{}
	cash.apply(models.ProcessedTransaction{Source: "degiro", TransactionType: "CASH", AmountEUR: 1000, CashBalance: 1000, BalanceCurrency: "EUR"})
	cash.apply(models.ProcessedTransaction{Source: "degiro", TransactionType: "STOCK", BuySell: "BUY", AmountEUR: -200, CashBalance: 5, BalanceCurrency: "EUR"})

	if got := cash.total(); math.Abs(got-800) > 0.001 {
		t.Errorf("expected 800, got %v", got)
	}
}

func TestHoldingsValueEUR_CountsHoldingsWithoutPriceAtCost(t *testing.T) {
	got := holdingsValueEUR([]models.HoldingWithValue{
		{Status: "OK", MarketValueEUR: 150, TotalCostBasisEUR: 100},
		{Status: "UNAVAILABLE", MarketValueEUR: 0, TotalCostBasisEUR: 200},
	})
	if math.Abs(got-350) > 0.001 {
		t.Errorf("expected 350, got %v", got)
	}
}

// Rows from before the balance columns existed, and any other row without a balance, have NULLs.
func TestFetchTransactions_HandlesRowsWithoutBalance(t *testing.T) {
	setupHistoryTestDB(t)
	_, err := database.DB.Exec(`INSERT INTO processed_transactions
		(user_id, portfolio_id, date, transaction_type, cash_balance, balance_currency)
		VALUES (1, 1, '10-01-2025', 'STOCK', NULL, NULL)`)
	if err != nil {
		t.Fatalf("failed to insert transaction: %v", err)
	}

	txs, err := fetchUserProcessedTransactions(1, 1)
	if err != nil {
		t.Fatalf("fetchUserProcessedTransactions returned error: %v", err)
	}
	if len(txs) != 1 || txs[0].CashBalance != 0 || txs[0].BalanceCurrency != "" {
		t.Errorf("unexpected transactions: %+v", txs)
	}
}
