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
	processedCommissions := make(map[string]bool)

	for _, tx := range transactions {
		if tx.TransactionType == "FEE" {
			category := "Brokerage Fee"
			if tx.TransactionSubType == "INTEREST" {
				category = "Interest"
			}

			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				AmountEUR:   tx.AmountEUR, // No rounding
				Source:      tx.Source,
				Category:    category,
			})
		}

		if tx.Commission > 0 && tx.OrderID != "" && !processedCommissions[tx.OrderID] {
			commissionEUR := tx.Commission

			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				// PRECISION UPDATE: Removed utils.RoundFloat
				AmountEUR: -commissionEUR,
				Source:    tx.Source,
				Category:  "Trade Commission",
			})
			processedCommissions[tx.OrderID] = true
		}
	}
	return feeDetails
}
