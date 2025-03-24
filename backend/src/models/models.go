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
	Date         string // Use time.Time for dates
	ProductName  string
	ISIN         string
	Quantity     int
	Price        float64
	OrderType    string  // e.g., "compra", "venda", "dividendo"
	Amount       float64 // Transaction amount in original currency
	Currency     string  // Original currency (e.g., "USD", "EUR")
	Commission   float64 // Commission/fees
	OrderID      string
	ExchangeRate float64 // Exchange rate to EUR (if applicable)
	AmountEUR    float64 // Transaction amount in EUR (calculated)
}

type SaleDetail struct {
	SaleDate      string
	BuyDate       string
	ProductName   string
	ISIN          string
	Quantity      int
	SalePrice     float64
	SaleAmount    float64 // Sale amount in original currency
	SaleCurrency  string
	SaleAmountEUR float64 // Sale amount in EUR
	BuyPrice      float64
	BuyAmount     float64 // Purchase amount in original currency
	BuyCurrency   string
	BuyAmountEUR  float64 // Purchase amount in EUR
	Delta         float64 // Profit/Loss (SaleAmountEUR - BuyAmountEUR)
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
