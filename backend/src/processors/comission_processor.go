package processors

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/username/taxfolio/backend/src/models"
)

// CalculateCommission calculates the total commission for a specific orderId.
func CalculateCommission(orderId string, transactions []models.RawTransaction) (float64, error) {

	// Return 0 immediately if orderId is empty
	if orderId == "" {
		return 0, nil
	}
	var totalCommission float64

	for _, transaction := range transactions {
		// Check if the orderId matches and if the description contains "Comissões de transação"
		if transaction.OrderID == orderId && strings.Contains(transaction.Description, "Comissões de transação") {
			// Convert the amount to float64
			amount, err := strconv.ParseFloat(transaction.Amount, 64)
			if err != nil {
				return 0, fmt.Errorf("invalid amount for transaction %s: %w", transaction.OrderID, err)
			}

			// Add the absolute value to the total
			if amount < 0 {
				amount = -amount
			}
			totalCommission += amount
		}
	}

	return totalCommission, nil
}

// degiroOrderCommissionsEUR returns each DeGiro order's commission in EUR, from its commission rows.
// The commission stored on a trade row can't be used for this: it adds up reversals as charges, and
// it was converted at the trade's exchange rate even when the commission was charged in EUR.
func degiroOrderCommissionsEUR(txs []models.ProcessedTransaction) map[string]float64 {
	commissions := make(map[string]float64)
	for _, tx := range txs {
		if tx.Source == "degiro" && tx.TransactionType == "COMMISSION_DETAIL" && tx.OrderID != "" {
			commissions[tx.OrderID] -= tx.AmountEUR
		}
	}
	for orderID, commission := range commissions {
		commissions[orderID] = math.Max(commission, 0)
	}
	return commissions
}

// allocateDegiroOrderCommissions splits each DeGiro order's commission across its fills, by quantity,
// so that an order filled in parts doesn't pay the total once per fill. Other sources already report
// commission per execution. Orders without commission rows use the commission stored on their fills.
// allTxs must include the commission rows. It updates fills in place, so callers must pass their own copy.
func allocateDegiroOrderCommissions(fills, allTxs []models.ProcessedTransaction) {
	orderCommissions := degiroOrderCommissionsEUR(allTxs)

	orderQuantities := make(map[string]float64)
	for _, tx := range fills {
		if tx.Source == "degiro" && tx.OrderID != "" {
			orderQuantities[tx.OrderID] += tx.Quantity
		}
	}

	for i := range fills {
		tx := &fills[i]
		if tx.Source != "degiro" || tx.OrderID == "" || orderQuantities[tx.OrderID] <= 0 {
			continue
		}
		orderCommission, found := orderCommissions[tx.OrderID]
		if !found {
			orderCommission = tx.Commission
		}
		tx.Commission = orderCommission * tx.Quantity / orderQuantities[tx.OrderID]
	}
}
