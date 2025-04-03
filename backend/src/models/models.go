package models

// Transaction represents a single transaction from the CSV file.
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

type ProcessedTransaction struct {
	Date             string // Use time.Time for dates
	ProductName      string
	ISIN             string
	Quantity         int
	OriginalQuantity int // Original quantity of the purchase lot before any sales
	Price            float64
	OrderType        string  // e.g., "compra", "venda", "dividendo"
	TransactionType  string  // e.g., "stock", "option", "comission", "cashCredit"
	Description      string  // Original description from RawTransaction
	Amount           float64 // Transaction amount in original currency
	Currency         string  // Original currency (e.g., "USD", "EUR")
	Commission       float64 // Commission/fees
	OrderID          string
	ExchangeRate     float64 // Exchange rate to EUR (if applicable)
	AmountEUR        float64 // Transaction amount in EUR (calculated)
	CountryCode      string  `json:"country_code,omitempty"` // Country code derived from ISIN
}

type SaleDetail struct {
	SaleDate         string
	BuyDate          string
	ProductName      string
	ISIN             string
	Quantity         int
	SalePrice        float64
	SaleAmount       float64 // Sale amount in original currency
	SaleCurrency     string
	SaleAmountEUR    float64 // Sale amount in EUR
	BuyPrice         float64
	BuyAmount        float64 // Purchase amount in original currency
	BuyExchangeRate  float64 // Exchange rate used for the buy transaction
	Commission       float64 // Commission/fees
	BuyCurrency      string
	BuyAmountEUR     float64 // Purchase amount in EUR
	SaleExchangeRate float64 // Exchange rate used for the sale transaction
	Delta            float64 // Profit/Loss (SaleAmountEUR - BuyAmountEUR)
	CountryCode      string  `json:"country_code"` // Country code derived from ISIN (e.g., "840 - United States of America (the)")
}

// PurchaseLot represents remaining unsold purchase lots
type PurchaseLot struct {
	BuyDate      string  `json:"buy_date"`
	ProductName  string  `json:"product_name"`
	ISIN         string  `json:"isin"`
	Quantity     int     `json:"quantity"`
	BuyPrice     float64 `json:"buyPrice"`
	BuyAmount    float64 `json:"buy_amount"`     // Purchase amount in original currency
	BuyCurrency  string  `json:"buy_currency"`   // Original purchase currency
	BuyAmountEUR float64 `json:"buy_amount_eur"` // Purchase amount in EUR
}

// OptionSaleDetail represents the details of a closed option position (buy/sell pair)
type OptionSaleDetail struct {
	OpenDate       string  `json:"open_date"`
	CloseDate      string  `json:"close_date"`
	ProductName    string  `json:"product_name"` // e.g., "FLW P31.00 18MAR22"
	Quantity       int     `json:"quantity"`
	OpenPrice      float64 `json:"open_price"`
	OpenAmount     float64 `json:"open_amount"` // Open amount in original currency
	OpenCurrency   string  `json:"open_currency"`
	OpenAmountEUR  float64 `json:"open_amount_eur"` // Open amount in EUR
	ClosePrice     float64 `json:"close_price"`
	CloseAmount    float64 `json:"close_amount"` // Close amount in original currency
	CloseCurrency  string  `json:"close_currency"`
	CloseAmountEUR float64 `json:"close_amount_eur"` // Close amount in EUR
	Commission     float64 `json:"commission"`       // Total commission for the round trip (or allocated portion)
	Delta          float64 `json:"delta"`            // Profit/Loss (CloseAmountEUR - OpenAmountEUR for long, OpenAmountEUR - CloseAmountEUR for short)
	OpenOrderID    string  `json:"open_order_id"`    // Optional: Order ID of the opening transaction
	CloseOrderID   string  `json:"close_order_id"`   // Optional: Order ID of the closing transaction
	CountryCode    string  `json:"country_code"`     // Country code derived from ISIN (e.g., "840 - United States of America (the)")
}

// OptionHolding represents an open option position (either long or short)
type OptionHolding struct {
	OpenDate      string  `json:"open_date"`
	ProductName   string  `json:"product_name"`
	Quantity      int     `json:"quantity"` // Positive for long positions, negative for short positions
	OpenPrice     float64 `json:"open_price"`
	OpenAmount    float64 `json:"open_amount"` // Open amount in original currency
	OpenCurrency  string  `json:"open_currency"`
	OpenAmountEUR float64 `json:"open_amount_eur"` // Open amount in EUR
	OpenOrderID   string  `json:"open_order_id"`   // Optional: Order ID of the opening transaction
}

// CashMovement represents a cash deposit or withdrawal
type CashMovement struct {
	Date     string  `json:"date"`     // Date of the movement
	Type     string  `json:"type"`     // "deposit" or "withdrawal"
	Amount   float64 `json:"amount"`   // Amount in original currency
	Currency string  `json:"currency"` // Original currency
}

// ExchangeRate represents the structure of the exchange rate JSON file.
type ExchangeRate struct {
	Root struct {
		Obs []struct {
			TimePeriod string `json:"_TIME_PERIOD"`
			ObsValue   string `json:"_OBS_VALUE"`
			Ccy        string `json:"_CCY"`
		} `json:"Obs"`
	} `json:"root"`
}

// DividendCountrySummary holds the aggregated dividend amounts for a specific country in a year.
type DividendCountrySummary struct {
	GrossAmt float64 `json:"gross_amt"`
	TaxedAmt float64 `json:"taxed_amt"`
}

// DividendTaxResult represents the final structure for the dividend tax summary endpoint.
// map[Year]map[Country]DividendCountrySummary
type DividendTaxResult map[string]map[string]DividendCountrySummary
