// backend/src/processors/transaction_processor.go
package processors

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"time"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

type TransactionProcessor struct{}

func NewTransactionProcessor() *TransactionProcessor { return &TransactionProcessor{} }

// Process enriches a list of canonical transactions with universal data.
// It trusts the classification (TransactionType, etc.) provided by the parser.
func (p *TransactionProcessor) Process(txs []models.CanonicalTransaction) []models.ProcessedTransaction {
	var processedTxs []models.ProcessedTransaction
	for _, tx := range txs {
		// --- Enrichment Stage ---

		// 1. Calculate Gross Amount. The parser has already classified the type.
		if tx.TransactionType == "STOCK" || tx.TransactionType == "OPTION" {
			calculatedAmount := tx.Quantity * tx.Price
			if tx.BuySell == "BUY" {
				tx.Amount = -math.Abs(calculatedAmount)
			} else {
				tx.Amount = math.Abs(calculatedAmount)
			}
		} else {
			// For dividends, cash, fees, use the direct signed amount from the CSV.
			tx.Amount = tx.SourceAmount
		}

		// 2. Enrich with Exchange Rate.
		rate, err := GetExchangeRate(tx.Currency, tx.TransactionDate)
		if err != nil || rate <= 0 {
			tx.ExchangeRate = 1.0 // Default to 1.0 if not found
		} else {
			tx.ExchangeRate = rate
		}

		// 3. Enrich with Amount in EUR.
		if tx.ExchangeRate > 0 {
			tx.AmountEUR = (tx.Amount - tx.Commission) / tx.ExchangeRate
		}

		// 4. Enrich with Country Code from ISIN.
		tx.CountryCode = utils.GetCountryCodeString(tx.ISIN)

		// 5. Enrich with a unique Hash ID.
		tx.HashId = generateHash(tx)

		// --- Final Mapping ---
		// Map the now fully-enriched CanonicalTransaction to the final ProcessedTransaction.
		processed := models.ProcessedTransaction{
			Date:               tx.TransactionDate.Format("02-01-2006"),
			Source:             tx.Source,
			ProductName:        tx.ProductName,
			ISIN:               tx.ISIN,
			Quantity:           int(tx.Quantity),
			OriginalQuantity:   int(tx.Quantity),
			Price:              tx.Price,
			TransactionType:    tx.TransactionType,
			TransactionSubType: tx.TransactionSubType,
			BuySell:            tx.BuySell,
			Description:        tx.RawText,
			Amount:             tx.Amount,
			Currency:           tx.Currency,
			Commission:         tx.Commission,
			OrderID:            tx.OrderID,
			ExchangeRate:       tx.ExchangeRate,
			AmountEUR:          tx.AmountEUR,
			CountryCode:        tx.CountryCode,
			InputString:        tx.RawText,
			HashId:             tx.HashId,
		}
		processedTxs = append(processedTxs, processed)
	}
	return processedTxs
}

// generateHash creates a unique hash for the transaction based on source data.
func generateHash(tx models.CanonicalTransaction) string {
	input := fmt.Sprintf("%s|%s|%f|%f", tx.TransactionDate.Format(time.RFC3339), tx.RawText, tx.SourceAmount, tx.Commission)
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}
