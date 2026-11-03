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
// It fails if a rate is missing for a row with a value, so that no wrong EUR amount gets stored:
// a later upload of the same file would skip those rows as duplicates and never correct them.
func (p *TransactionProcessor) Process(txs []models.CanonicalTransaction) ([]models.ProcessedTransaction, error) {
	var processedTxs []models.ProcessedTransaction
	for _, tx := range txs {
		// --- Enrichment Stage ---

		// 1. Enrich with Exchange Rate.
		rate, err := GetExchangeRate(tx.Currency, tx.TransactionDate)
		if err != nil {
			if tx.Amount != 0 || tx.Commission != 0 {
				return nil, missingRateError(tx.Currency, tx.TransactionDate, err)
			}
			// Nothing on this row needs converting, and some rows have no currency at all.
			rate = 1.0
		}
		tx.ExchangeRate = rate

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
		if tx.Commission != 0 && tx.CommissionCurrency != "" && tx.CommissionCurrency != tx.Currency {
			commissionRate, err = GetExchangeRate(tx.CommissionCurrency, tx.TransactionDate)
			if err != nil {
				return nil, missingRateError(tx.CommissionCurrency, tx.TransactionDate, err)
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
			Quantity:           tx.Quantity,
			OriginalQuantity:   tx.Quantity,
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
	return processedTxs, nil
}

// missingRateError logs the cause and returns the message shown to the user.
func missingRateError(currency string, date time.Time, cause error) error {
	logger.L.Warn("Could not find exchange rate", "currency", currency, "date", date, "error", cause)
	return fmt.Errorf("não foi possível obter a taxa de câmbio de %s para %s; nenhuma transação foi importada, tente novamente mais tarde", currency, date.Format("2006-01-02"))
}

// generateHash creates a unique hash for the transaction based on key source data.
func generateHash(tx models.CanonicalTransaction) string {
	hash := sha256.Sum256([]byte(tx.RawText))
	return hex.EncodeToString(hash[:])
}
