package processors

import (
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

func TestTransactionProcessor_ConvertsCommissionFromItsOwnCurrency(t *testing.T) {
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	date := time.Date(2026, 2, 16, 0, 0, 0, 0, time.UTC)
	for currency, rate := range map[string]float64{"PLN": 4, "USD": 2} {
		rateCache.Set("history-fetched-"+currency, true, time.Hour)
		rateCache.Set("rate-"+currency+"-2026-02-16", rate, time.Hour)
	}

	tests := []struct {
		name               string
		commissionCurrency string
		want               float64
	}{
		{"charged in EUR on a PLN trade", "EUR", 12},
		{"charged in another foreign currency", "USD", 6},
		{"charged in the trade currency", "PLN", 3},
		{"no commission currency reported", "", 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			processed := NewTransactionProcessor().Process([]models.CanonicalTransaction{{
				Source: "ibkr", TransactionDate: date, Currency: "PLN", Amount: -400,
				Commission: 12, CommissionCurrency: tt.commissionCurrency,
			}})

			assertAmount(t, "commission", tt.want, processed[0].Commission)
			assertAmount(t, "amount", -100, processed[0].AmountEUR)
		})
	}
}
