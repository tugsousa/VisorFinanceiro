// backend/src/processors/transaction_processor.go
package processors

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

// TransactionProcessor enriches canonical transactions with data that is not source-specific.
type TransactionProcessor struct{}

func NewTransactionProcessor() *TransactionProcessor { return &TransactionProcessor{} }

// Process iterates through canonical transactions and enriches them.
// It no longer calculates the amount, trusting the value provided by the specific parser.
func (p *TransactionProcessor) Process(txs []models.CanonicalTransaction) []models.ProcessedTransaction {
	var processedTxs []models.ProcessedTransaction
	for _, tx := range txs {
		// --- Enrichment Stage ---

		// 1. Enrich with Exchange Rate.
		rate, err := GetExchangeRate(tx.Currency, tx.TransactionDate)
		if err != nil {
			logger.L.Warn("Could not find exchange rate, defaulting to 1.0", "currency", tx.Currency, "date", tx.TransactionDate, "orderID", tx.OrderID, "error", err)
			tx.ExchangeRate = 1.0
		} else {
			tx.ExchangeRate = rate
		}

		// 2. Enrich with Amount in EUR.
		// This now uses the pre-calculated, signed `Amount` from the canonical transaction.
		if tx.ExchangeRate > 0 {
			tx.AmountEUR = tx.Amount / tx.ExchangeRate
		} else {
			tx.AmountEUR = tx.Amount // Fallback if exchange rate is somehow zero
		}

		// 3. Enrich with Country Code from ISIN.
		tx.CountryCode = utils.GetCountryCodeString(tx.ISIN)

		// 4. Enrich with a unique Hash ID.
		tx.HashId = generateHash(tx)

		// --- Final Mapping ---
		// Map the fully-enriched CanonicalTransaction to the final ProcessedTransaction.
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
			Amount:             tx.Amount, // This is now the correct signed amount from the parser
			Currency:           tx.Currency,
			Commission:         tx.Commission,
			OrderID:            tx.OrderID,
			ExchangeRate:       tx.ExchangeRate,
			AmountEUR:          tx.AmountEUR, // This is the correctly converted EUR amount
			CountryCode:        tx.CountryCode,
			InputString:        tx.RawText,
			HashId:             tx.HashId,
		}
		processedTxs = append(processedTxs, processed)
	}
	return processedTxs
}

// generateHash creates a unique hash for the transaction based on key source data.
func generateHash(tx models.CanonicalTransaction) string {
	input := fmt.Sprintf(
		"%s|%s|%s|%f|%f",
		tx.TransactionDate.Format(time.RFC3339),
		tx.RawText,
		tx.OrderID,
		tx.SourceAmount,
		tx.Commission,
	)
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}
