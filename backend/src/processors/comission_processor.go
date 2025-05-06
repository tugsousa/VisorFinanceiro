package processors

import (
	"fmt"
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
