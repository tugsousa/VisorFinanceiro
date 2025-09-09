// backend/src/models/fee.go
package models

type FeeDetail struct {
	Date        string  `json:"date"`
	Description string  `json:"description"`
	AmountEUR   float64 `json:"amount_eur"`
	Source      string  `json:"source"`
	Category    string  `json:"category"`
}
