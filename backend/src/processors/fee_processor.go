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
		// Case 1: Dedicated Fee Transactions (e.g., Degiro "custo de conectividade", "juros")
		if tx.TransactionType == "FEE" {
			category := "Brokerage Fee" // Default
			if tx.TransactionSubType == "INTEREST" {
				category = "Interest"
			}

			// For dedicated fees, we use AmountEUR (which is the net movement, usually negative)
			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				AmountEUR:   tx.AmountEUR,
				Source:      tx.Source,
				Category:    category,
			})
		}

		// Case 2: Commissions from Trades (STOCK/OPTION)
		// We use the tx.Commission field, which is now guaranteed to be in EUR.
		// We use tx.OrderID to consolidate commission for partial fills.
		if tx.Commission > 0 && tx.OrderID != "" && !processedCommissions[tx.OrderID] {
			// A comissão é o valor absoluto do tx.Commission (já em EUR)
			commissionEUR := tx.Commission

			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName, // Use the product name for context
				// Comissões são um custo (negativo), usamos o valor da comissão (positivo) e invertemos o sinal.
				AmountEUR: utils.RoundFloat(-commissionEUR, 2),
				Source:    tx.Source,
				Category:  "Trade Commission",
			})
			processedCommissions[tx.OrderID] = true // Mark this OrderID as processed
		}
	}
	return feeDetails
}
