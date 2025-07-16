package models

// RawTransaction represents a single transaction from the CSV file.
type RawTransaction struct {
	OrderDate    string `json:"order_date"`    // Date of the order
	OrderTime    string `json:"order_time"`    // Time of the order
	ValueDate    string `json:"value_date"`    // Date the transaction is effective
	Name         string `json:"name"`          // Description of the transaction
	ISIN         string `json:"isin"`          // ISIN code of the product
	Description  string `json:"Description"`   // Type of transaction (e.g., "buy", "sell", "fee")
	ExchangeRate string `json:"exchange_rate"` // Exchange rate (if applicable)
	Currency     string `json:"currency"`      // Currency of the transaction
	Amount       string `json:"amount"`        // Transaction amount in the original currency
	OrderID      string `json:"order_id"`      // Unique ID for the order
}

// ProcessedTransaction represents a transaction after initial processing and enrichment.
type ProcessedTransaction struct {
	ID                 int64   `json:"id,omitempty"` // Database primary key
	Date               string  `json:"date"`
	Source             string  `json:"source"` // e.g., DEGIRO, IBKR
	ProductName        string  `json:"product_name"`
	ISIN               string  `json:"isin"`
	Quantity           int     `json:"quantity"`
	OriginalQuantity   int     `json:"original_quantity"` // Original quantity of the purchase lot before any sales
	Price              float64 `json:"price"`
	TransactionType    string  `json:"transaction_type"`    // e.g., "STOCK", "OPTION", "DIVIDEND", "FEE", "CASH"
	TransactionSubType string  `json:"transaction_subtype"` // e.g., "CALL", "PUT", "TAX", "DEPOSIT"
	BuySell            string  `json:"buy_sell"`            // "BUY", "SELL", or empty
	Description        string  `json:"description"`         // Original description from RawTransaction
	Amount             float64 `json:"amount"`              // Transaction amount in original currency
	Currency           string  `json:"currency"`            // Original currency (e.g., "USD", "EUR")
	Commission         float64 `json:"commission"`          // Commission/fees
	OrderID            string  `json:"order_id"`
	ExchangeRate       float64 `json:"exchange_rate"`          // Exchange rate to EUR (if applicable)
	AmountEUR          float64 `json:"amount_eur"`             // Transaction amount in EUR (calculated)
	CountryCode        string  `json:"country_code,omitempty"` // Country code derived from ISIN
	InputString        string  `json:"input_string"`           // The full description string for reference
	HashId             string  `json:"hash_id"`                // Generated hash for potential duplicate checking
}

// CashMovement represents a cash deposit or withdrawal
type CashMovement struct {
	Date     string  `json:"date"`     // Date of the movement
	Type     string  `json:"type"`     // "deposit" or "withdrawal"
	Amount   float64 `json:"amount"`   // Amount in original currency
	Currency string  `json:"currency"` // Original currency
}
