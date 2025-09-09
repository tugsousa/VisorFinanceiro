// backend/src/processors/fee_processor.go
package processors

import (
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

type feeProcessorImpl struct{}

func NewFeeProcessor() FeeProcessor {
	return &feeProcessorImpl{}
}

func (p *feeProcessorImpl) Process(transactions []models.ProcessedTransaction) []models.FeeDetail {
	var feeDetails []models.FeeDetail
	processedCommissions := make(map[string]bool) // Map to track processed order IDs for commissions

	for _, tx := range transactions {
		// Case 1: Dedicated Fee Transactions (e.g., Degiro "custo de conectividade")
		if tx.TransactionType == "FEE" {
			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				AmountEUR:   tx.AmountEUR, // This is already calculated in EUR
				Source:      tx.Source,
				Category:    "Brokerage Fee",
			})
		}

		// Case 2: Commissions from Trades
		// This check prevents adding the total commission for a single order multiple times
		// if the order was executed in several partial trades.
		if tx.Commission > 0 && tx.OrderID != "" && !processedCommissions[tx.OrderID] {
			var commissionEUR float64

			// DEGIRO CSVs report commissions in EUR, even for foreign currency trades.
			// IBKR reports commissions in the trade's currency.
			if tx.Source == "degiro" {
				commissionEUR = tx.Commission
			} else {
				// For other brokers, we assume the commission is in the transaction's currency
				// and needs to be converted using the provided exchange rate.
				if tx.ExchangeRate > 0 {
					commissionEUR = tx.Commission / tx.ExchangeRate
				} else {
					commissionEUR = tx.Commission // Fallback if rate is missing
				}
			}

			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,                      // Use the product name for context
				AmountEUR:   utils.RoundFloat(-commissionEUR, 2), // Commissions are a cost (negative)
				Source:      tx.Source,
				Category:    "Trade Commission",
			})
			processedCommissions[tx.OrderID] = true // Mark this OrderID as processed
		}
	}
	return feeDetails
}
