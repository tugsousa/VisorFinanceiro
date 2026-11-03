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
	degiroCommissions := degiroOrderCommissionsEUR(transactions)

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

		if tx.Commission > 0 {
			commissionEUR := tx.Commission

			// Every row of a DeGiro order stores the order's total, so the order only counts once.
			// Other sources store the commission of each execution on its own row.
			if tx.Source == "degiro" && tx.OrderID != "" {
				if processedCommissions[tx.OrderID] {
					continue
				}
				processedCommissions[tx.OrderID] = true
				if orderCommission, found := degiroCommissions[tx.OrderID]; found {
					commissionEUR = orderCommission
				}
			}

			feeDetails = append(feeDetails, models.FeeDetail{
				Date:        tx.Date,
				Description: tx.ProductName,
				// PRECISION UPDATE: Removed utils.RoundFloat
				AmountEUR: -commissionEUR,
				Source:    tx.Source,
				Category:  "Trade Commission",
			})
		}
	}
	return feeDetails
}
