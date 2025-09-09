// backend/src/processors/fee_processor.go
package processors

import (
	"github.com/username/taxfolio/backend/src/models"
)

type feeProcessorImpl struct{}

func NewFeeProcessor() FeeProcessor {
	return &feeProcessorImpl{}
}

func (p *feeProcessorImpl) Process(transactions []models.ProcessedTransaction) []models.FeeDetail {
	var feeDetails []models.FeeDetail

	for _, tx := range transactions {
		// Case 1: Dedicated Fee Transactions (e.g., from Degiro)
		if tx.TransactionType == "FEE" {
			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				AmountEUR:   tx.AmountEUR,
				Source:      tx.Source,
				Category:    "Brokerage Fee", // You can enhance this later
			})
		}

		// Case 2: Commissions from Trades (both Degiro and IBKR)
		if tx.Commission > 0 {
			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				AmountEUR:   -tx.Commission, // Commissions are a negative value (cost)
				Source:      tx.Source,
				Category:    "Trade Commission",
			})
		}
	}
	return feeDetails
}
