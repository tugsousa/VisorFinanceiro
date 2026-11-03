// backend/src/processors/transaction_processor.go
package processors

import (
	"crypto/sha256"
	"encoding/hex"

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

		// NOVO PASSO 3: Converter a comissão para EUR.
		// O campo tx.Commission (Canonical) tem o valor na moeda original.
		// A comissão pode ser cobrada numa moeda diferente da transação.
		commissionRate := tx.ExchangeRate
		if tx.CommissionCurrency != "" && tx.CommissionCurrency != tx.Currency {
			commissionRate, err = GetExchangeRate(tx.CommissionCurrency, tx.TransactionDate)
			if err != nil {
				logger.L.Warn("Could not find commission exchange rate, defaulting to 1.0", "currency", tx.CommissionCurrency, "date", tx.TransactionDate, "orderID", tx.OrderID, "error", err)
				commissionRate = 1.0
			}
		}

		var commissionEUR float64
		if commissionRate > 0 {
			commissionEUR = tx.Commission / commissionRate
		} else {
			commissionEUR = tx.Commission // Assume 1:1 se a taxa for 0 ou 1
		}

		// 4. Enrich with Country Code from ISIN.
		tx.CountryCode = utils.GetCountryCodeString(tx.ISIN)

		// 5. Enrich with a unique Hash ID.
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
			Amount:             tx.Amount,
			Currency:           tx.Currency,
			Commission:         commissionEUR, // <--- USAR O VALOR CONVERTIDO AQUI
			OrderID:            tx.OrderID,
			ExchangeRate:       tx.ExchangeRate,
			AmountEUR:          tx.AmountEUR,
			CountryCode:        tx.CountryCode,
			InputString:        tx.RawText,
			HashId:             tx.HashId,
			CashBalance:        tx.CashBalance,
			BalanceCurrency:    tx.BalanceCurrency,
		}
		processedTxs = append(processedTxs, processed)
	}
	return processedTxs
}

// generateHash creates a unique hash for the transaction based on key source data.
func generateHash(tx models.CanonicalTransaction) string {
	hash := sha256.Sum256([]byte(tx.RawText))
	return hex.EncodeToString(hash[:])
}
