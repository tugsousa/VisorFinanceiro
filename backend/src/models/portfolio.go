package models

// SaleDetail represents the details of a completed stock sale, matching a purchase.
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

// PurchaseLot represents remaining unsold purchase lots for stocks.
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

// OptionSaleDetail represents the details of a closed option position (buy/sell pair).
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

// OptionHolding represents an open option position (either long or short).
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
