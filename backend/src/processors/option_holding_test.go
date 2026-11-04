package processors

import (
	"math"
	"testing"

	"github.com/username/taxfolio/backend/src/models"
)

// A holding used to keep the cost of the whole purchase after part of it was sold.
func TestOptionProcessor_HoldingCostAfterPartialClose(t *testing.T) {
	transactions := []models.ProcessedTransaction{
		{Date: "01-01-2025", ProductName: "ACME C100", TransactionType: "OPTION", BuySell: "BUY", Quantity: 10, OriginalQuantity: 10, Amount: -1000, AmountEUR: -900, ExchangeRate: 1, OrderID: "1"},
		{Date: "02-01-2025", ProductName: "ACME C100", TransactionType: "OPTION", BuySell: "SELL", Quantity: 4, OriginalQuantity: 4, Amount: 500, AmountEUR: 450, ExchangeRate: 1, OrderID: "2"},
	}

	_, holdings := NewOptionProcessor().Process(transactions)

	if len(holdings) != 1 {
		t.Fatalf("expected 1 holding, got %d", len(holdings))
	}
	if holdings[0].Quantity != 6 {
		t.Errorf("expected 6 options, got %v", holdings[0].Quantity)
	}
	if math.Abs(holdings[0].OpenAmount-(-600)) > 0.001 {
		t.Errorf("expected a cost of -600, got %v", holdings[0].OpenAmount)
	}
	if math.Abs(holdings[0].OpenAmountEUR-(-540)) > 0.001 {
		t.Errorf("expected a cost of -540 EUR, got %v", holdings[0].OpenAmountEUR)
	}
}

func TestOptionProcessor_ShortHoldingCostAfterPartialClose(t *testing.T) {
	transactions := []models.ProcessedTransaction{
		{Date: "01-01-2025", ProductName: "ACME P100", TransactionType: "OPTION", BuySell: "SELL", Quantity: 10, OriginalQuantity: 10, Amount: 1000, AmountEUR: 1000, ExchangeRate: 1, OrderID: "1"},
		{Date: "02-01-2025", ProductName: "ACME P100", TransactionType: "OPTION", BuySell: "BUY", Quantity: 5, OriginalQuantity: 5, Amount: -300, AmountEUR: -300, ExchangeRate: 1, OrderID: "2"},
	}

	_, holdings := NewOptionProcessor().Process(transactions)

	if len(holdings) != 1 {
		t.Fatalf("expected 1 holding, got %d", len(holdings))
	}
	if holdings[0].Quantity != -5 {
		t.Errorf("expected -5 options, got %v", holdings[0].Quantity)
	}
	if math.Abs(holdings[0].OpenAmount-500) > 0.001 {
		t.Errorf("expected an amount of 500, got %v", holdings[0].OpenAmount)
	}
}
