// backend/src/models/canonical.go
package models

import "time"

// CanonicalTransaction is the unified, intermediate representation of a transaction.
// Each parser is responsible for populating as many of these fields as possible
// directly from the source file, including the initial classification and the final signed amount.
type CanonicalTransaction struct {
	// --- Fields to be populated by the Parser ---
	Source             string    `json:"source"`
	TransactionDate    time.Time `json:"transaction_date"`
	ProductName        string    `json:"product_name"`
	ISIN               string    `json:"isin"`
	Quantity           float64   `json:"quantity"`
	Price              float64   `json:"price"`
	Commission         float64   `json:"commission"`
	Currency           string    `json:"currency"`
	OrderID            string    `json:"order_id"`
	RawText            string    `json:"raw_text"`
	SourceAmount       float64   `json:"source_amount"`        // The original, unsigned amount from the source file for reference
	Amount             float64   `json:"amount"`               // The final, correctly signed gross transaction amount in the original currency
	TransactionType    string    `json:"transaction_type"`     // e.g., "STOCK", "OPTION", "DIVIDEND", "FEE", "CASH"
	TransactionSubType string    `json:"transaction_sub_type"` // e.g., "CALL", "PUT", "TAX", "DEPOSIT"
	BuySell            string    `json:"buy_sell"`             // e.g., "BUY", "SELL"

	// --- Fields to be filled by the Enricher/Processor ---
	ExchangeRate float64 `json:"exchange_rate"` // Exchange rate to EUR
	AmountEUR    float64 `json:"amount_eur"`    // Final amount in EUR
	CountryCode  string  `json:"country_code"`
	HashId       string  `json:"hash_id"`
}
