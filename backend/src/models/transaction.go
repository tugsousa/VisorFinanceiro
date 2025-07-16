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
	ID                 int64  `json:"id,omitempty"` // Add this field for the database primary key
	Date               string // Use time.Time for dates
	Source             string // e.g., DEGIRO, IBKR
	ProductName        string
	ISIN               string
	Quantity           int
	OriginalQuantity   int // Original quantity of the purchase lot before any sales
	Price              float64
	TransactionType    string  // e.g., "stock", "option", "comission", "cash", dividend
	TransactionSubType string  // e.g., call, put, tax, dividend, etf, stk
	BuySell            string  // e.g., "buy", "sell"
	Description        string  // Original description from RawTransaction
	Amount             float64 // Transaction amount in original currency
	Currency           string  // Original currency (e.g., "USD", "EUR")
	Commission         float64 // Commission/fees
	OrderID            string
	ExchangeRate       float64 // Exchange rate to EUR (if applicable)
	AmountEUR          float64 // Transaction amount in EUR (calculated)
	CountryCode        string  `json:"country_code,omitempty"` // Country code derived from ISIN
	InputString        string
	HashId             string // generated hash
}

// CashMovement represents a cash deposit or withdrawal
type CashMovement struct {
	Date     string  `json:"date"`     // Date of the movement
	Type     string  `json:"type"`     // "deposit" or "withdrawal"
	Amount   float64 `json:"amount"`   // Amount in original currency
	Currency string  `json:"currency"` // Original currency
}
