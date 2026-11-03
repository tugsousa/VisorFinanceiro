package services

import (
	"testing"

	"github.com/username/taxfolio/backend/src/database"
)

// The quantity columns are declared INTEGER, and SQLite only keeps a fraction if it's stored as REAL.
func TestFractionalQuantitySurvivesTheDatabase(t *testing.T) {
	setupHistoryTestDB(t)

	for _, quantity := range []float64{0.5, 10.25, 3} {
		_, err := database.DB.Exec(`INSERT INTO processed_transactions
			(user_id, portfolio_id, date, transaction_type, buy_sell, quantity, original_quantity)
			VALUES (1, 1, '01-01-2025', 'STOCK', 'BUY', ?, ?)`, quantity, quantity)
		if err != nil {
			t.Fatalf("failed to insert transaction: %v", err)
		}
	}

	txs, err := fetchUserProcessedTransactions(1, 1)
	if err != nil {
		t.Fatalf("fetchUserProcessedTransactions returned error: %v", err)
	}
	want := []float64{0.5, 10.25, 3}
	if len(txs) != len(want) {
		t.Fatalf("expected %d transactions, got %d", len(want), len(txs))
	}
	for i, tx := range txs {
		if tx.Quantity != want[i] || tx.OriginalQuantity != want[i] {
			t.Errorf("row %d: quantity %v and original %v, want %v", i, tx.Quantity, tx.OriginalQuantity, want[i])
		}
	}
}

func TestEurRateForDate(t *testing.T) {
	rates := map[string]PriceMap{
		"USD": {"2025-01-02": 0.9},
		"GBP": {"2025-01-02": 1.2},
		"GBp": {"2025-01-02": 1.2}, // Rates of a minor currency are quoted for its major currency
	}

	tests := []struct {
		name     string
		currency string
		date     string
		want     float64
		wantOK   bool
	}{
		{"EUR needs no rate", "EUR", "2025-01-02", 1, true},
		{"major currency", "USD", "2025-01-02", 0.9, true},
		{"pence are converted from pounds", "GBp", "2025-01-02", 0.012, true},
		{"no rate on that date", "USD", "2024-01-02", 0, false},
		{"no rates for the currency", "SEK", "2025-01-02", 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := eurRateForDate(tt.currency, tt.date, rates)
			if ok != tt.wantOK || got != tt.want {
				t.Errorf("got %v, %v; want %v, %v", got, ok, tt.want, tt.wantOK)
			}
		})
	}
}
