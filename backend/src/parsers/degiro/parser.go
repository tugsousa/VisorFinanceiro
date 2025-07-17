// backend/src/parsers/degiro/parser.go
package degiro

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/models"
)

type RawTransaction struct {
	OrderDate, OrderTime, ValueDate, Name, ISIN, Description, ExchangeRate, Currency, Amount, OrderID string
}

type DeGiroParser struct{}

func NewParser() *DeGiroParser {
	return &DeGiroParser{}
}

func (p *DeGiroParser) Parse(file io.Reader) ([]models.CanonicalTransaction, error) {
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1

	if _, err := reader.Read(); err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read all CSV records: %w", err)
	}

	var rawTxs []RawTransaction
	for _, record := range records {
		if len(record) >= 12 {
			rawTxs = append(rawTxs, RawTransaction{
				OrderDate: record[0], OrderTime: record[1], ValueDate: record[2],
				Name: record[3], ISIN: record[4], Description: record[5],
				ExchangeRate: record[6], Currency: record[7], Amount: record[8],
				OrderID: record[11],
			})
		}
	}

	var canonicalTxs []models.CanonicalTransaction
	for _, raw := range rawTxs {
		date, err := time.Parse("02-01-2006", raw.OrderDate)
		if err != nil {
			log.Printf("Skipping row due to invalid date: %s", raw.OrderDate)
			continue
		}

		sourceAmt, _ := strconv.ParseFloat(raw.Amount, 64)

		// The parser now performs the full classification.
		txType, subType, buySell, productName, quantity, price := classifyDeGiroTransaction(raw)

		// Skip unknown transactions that the parser couldn't classify.
		if txType == "UNKNOWN" {
			continue
		}

		commission, _ := findCommissionForOrder(raw.OrderID, rawTxs)

		tx := models.CanonicalTransaction{
			Source:             "degiro",
			TransactionDate:    date,
			ProductName:        productName,
			ISIN:               strings.TrimSpace(raw.ISIN),
			Quantity:           quantity,
			Price:              price,
			Currency:           raw.Currency,
			OrderID:            raw.OrderID,
			RawText:            raw.Description,
			SourceAmount:       sourceAmt,
			TransactionType:    txType,
			TransactionSubType: subType,
			BuySell:            buySell,
			Commission:         commission,
		}
		canonicalTxs = append(canonicalTxs, tx)
	}

	return canonicalTxs, nil
}

// classifyDeGiroTransaction contains all broker-specific logic.
func classifyDeGiroTransaction(raw RawTransaction) (txType, subType, buySell, productName string, quantity, price float64) {
	lowerDesc := strings.ToLower(raw.Description)

	// Handle non-trade types first
	if strings.Contains(lowerDesc, "dividendo") {
		if strings.Contains(lowerDesc, "imposto sobre dividendo") {
			return "DIVIDEND", "TAX", "", raw.Name, 0, 0
		}
		return "DIVIDEND", "", "", raw.Name, 0, 0
	}
	if strings.Contains(lowerDesc, "depósito") || strings.Contains(lowerDesc, "flatex deposit") {
		return "CASH", "DEPOSIT", "", "Cash Deposit", 0, 0
	}
	if strings.Contains(lowerDesc, "degiro cash sweep transfer") {
		return "CASH", "SWEEP", "", "Cash Sweep Transfer", 0, 0
	}
	if strings.Contains(lowerDesc, "comissões de transação") || strings.Contains(lowerDesc, "custo de conectividade") {
		return "FEE", "", "", "Brokerage Fee", 0, 0
	}
	if strings.Contains(lowerDesc, "mudança de produto") {
		return "PRODUCT_CHANGE", "", "", "Product Change", 0, 0
	}

	// Handle trades (Stocks and Options)
	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+([\d\s.,]+)\s+(.+?)\s*@([\d,.]+)`)
	matches := stockOrOptionRe.FindStringSubmatch(raw.Description)
	if matches == nil {
		return "UNKNOWN", "", "", "", 0, 0 // Cannot classify
	}

	buySellRaw := strings.ToLower(matches[1])
	if buySellRaw == "compra" {
		buySell = "BUY"
	} else if buySellRaw == "venda" {
		buySell = "SELL"
	}

	productName = strings.TrimSpace(matches[3])

	quantityStr := strings.ReplaceAll(strings.ReplaceAll(matches[2], " ", ""), ".", "")
	quantityStr = strings.ReplaceAll(quantityStr, ",", ".")
	quantity, _ = strconv.ParseFloat(quantityStr, 64)

	priceStr := strings.ReplaceAll(matches[4], ",", ".")
	price, _ = strconv.ParseFloat(priceStr, 64)

	// Now check if it's an option or a stock
	optionPatternRe := regexp.MustCompile(`\s+[CP]\d+(\.\d+)?\s+\d{2}[A-Z]{3}\d{2}$`)
	if optionPatternRe.MatchString(productName) {
		txType = "OPTION"
		if strings.Contains(productName, " C") {
			subType = "CALL"
		} else if strings.Contains(productName, " P") {
			subType = "PUT"
		}
	} else {
		txType = "STOCK"
	}

	return
}

func findCommissionForOrder(orderId string, transactions []RawTransaction) (float64, error) {
	if orderId == "" {
		return 0, nil
	}
	var totalCommission float64
	for _, transaction := range transactions {
		if transaction.OrderID == orderId && strings.Contains(transaction.Description, "Comissões de transação") {
			amount, err := strconv.ParseFloat(transaction.Amount, 64)
			if err != nil {
				return 0, fmt.Errorf("invalid amount for transaction %s: %w", transaction.OrderID, err)
			}
			if amount < 0 {
				amount = -amount
			}
			totalCommission += amount
		}
	}
	return totalCommission, nil
}
