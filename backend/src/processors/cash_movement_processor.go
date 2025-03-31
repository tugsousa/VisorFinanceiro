package processors

import (
	"TAXFOLIO/src/models"
	"strings"
)

// cashMovementProcessor implements the CashMovementProcessor interface.
type cashMovementProcessor struct{}

// NewCashMovementProcessor creates a new instance of CashMovementProcessor.
func NewCashMovementProcessor() CashMovementProcessor {
	return &cashMovementProcessor{}
}

// Process identifies cash deposits and withdrawals from the list of processed transactions.
func (p *cashMovementProcessor) Process(transactions []models.ProcessedTransaction) []models.CashMovement {
	var cashMovements []models.CashMovement

	for _, tx := range transactions {
		// Check for cash deposits
		if strings.ToLower(tx.OrderType) == "cashdeposit" {
			movement := models.CashMovement{
				Date:      tx.Date,
				Type:      "deposit", // Currently only handling deposits
				Amount:    tx.Amount,
				Currency:  tx.Currency,
				AmountEUR: tx.AmountEUR,
				OrderID:   tx.OrderID,
			}
			cashMovements = append(cashMovements, movement)
		}
		// TODO: Add logic for withdrawals if needed, e.g., check for a specific OrderType or Description
	}

	// TODO: Consider sorting cashMovements by date if necessary

	return cashMovements
}
