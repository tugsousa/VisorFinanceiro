// backend/src/parsers/degiro/parser.go
package degiro

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/models"
)

// RawTransaction holds the direct string values from a single row of a DeGiro CSV.
type RawTransaction struct {
	OrderDate, OrderTime, ValueDate, Name, ISIN, Description, ExchangeRate, Currency, Amount, OrderID string
}

// DeGiroParser implements the parsers.Parser interface for DeGiro files.
type DeGiroParser struct{}

// NewParser creates a new instance of the DeGiroParser.
func NewParser() *DeGiroParser {
	return &DeGiroParser{}
}

// Parse reads a DeGiro CSV file and converts its rows into a slice of CanonicalTransaction.
// This method now contains the full logic, from reading the CSV to classifying transactions.
func (p *DeGiroParser) Parse(file io.Reader) ([]models.CanonicalTransaction, error) {
	// --- CSV Reading Logic (formerly in csv_parser.go) ---
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // Allow variable number of fields per record

	// Read and discard the header row
	if _, err := reader.Read(); err != nil {
		return nil, fmt.Errorf("degiro parser: failed to read CSV header: %w", err)
	}

	records, err := reader.ReadAll() // Read all records at once
	if err != nil {
		return nil, fmt.Errorf("degiro parser: failed to read all CSV records: %w", err)
	}

	// --- Raw Transaction Mapping ---
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

	// --- Canonical Transaction Conversion ---
	var canonicalTxs []models.CanonicalTransaction
	for _, raw := range rawTxs {
		date, err := time.Parse("02-01-2006", raw.OrderDate)
		if err != nil {
			log.Printf("DeGiro Parser: Skipping row due to invalid date: %s (OrderID: %s)", raw.OrderDate, raw.OrderID)
			continue
		}

		txType, subType, buySell, productName, quantity, price := classifyDeGiroTransaction(raw)
		if txType == "UNKNOWN" {
			log.Printf("DeGiro Parser: Skipping unknown transaction type for description: '%s'", raw.Description)
			continue
		}

		sourceAmt, _ := strconv.ParseFloat(raw.Amount, 64)
		finalAmount := sourceAmt // For DeGiro, the sign is authoritative

		// Enforce sign for specific types to be safe
		if txType == "FEE" || (txType == "DIVIDEND" && subType == "TAX") {
			finalAmount = -math.Abs(sourceAmt)
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
			Amount:             finalAmount,
			TransactionType:    txType,
			TransactionSubType: subType,
			BuySell:            buySell,
			Commission:         commission,
		}
		canonicalTxs = append(canonicalTxs, tx)
	}

	return canonicalTxs, nil
}

// classifyDeGiroTransaction remains the same as before.
func classifyDeGiroTransaction(raw RawTransaction) (txType, subType, buySell, productName string, quantity, price float64) {
	desc := strings.TrimSpace(strings.ReplaceAll(raw.Description, "\u00A0", " "))
	lowerDesc := strings.ToLower(desc)

	// Handle non-trade types first
	if strings.Contains(lowerDesc, "dividendo") {
		productName = strings.TrimSpace(raw.Name)
		if strings.Contains(lowerDesc, "imposto sobre dividendo") {
			return "DIVIDEND", "TAX", "", productName, 0, 0
		}
		return "DIVIDEND", "", "", productName, 0, 0
	}
	if strings.EqualFold(lowerDesc, "depósito") || strings.Contains(lowerDesc, "flatex deposit") {
		return "CASH", "DEPOSIT", "", "Cash Deposit", 0, 0
	}
	if strings.Contains(lowerDesc, "comissões de transação") || strings.Contains(lowerDesc, "custo de conectividade") {
		return "FEE", "", "", "Brokerage Fee", 0, 0
	}
	if strings.Contains(lowerDesc, "mudança de produto") {
		return "PRODUCT_CHANGE", "", "", "Product Change", 0, 0
	}

	// Handle trades (Stocks and Options) using regex
	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+([\d\s.,]+)\s+(.+?)\s*@([\d,.]+)`)
	matches := stockOrOptionRe.FindStringSubmatch(desc)
	if matches == nil {
		return "UNKNOWN", "", "", "", 0, 0
	}

	// Extract details
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

	// Differentiate between Stock and Option
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

// findCommissionForOrder remains the same as before.
func findCommissionForOrder(orderId string, transactions []RawTransaction) (float64, error) {
	if orderId == "" {
		return 0, nil
	}
	var totalCommission float64
	for _, transaction := range transactions {
		if transaction.OrderID == orderId && strings.Contains(transaction.Description, "Comissões de transação") {
			amount, err := strconv.ParseFloat(transaction.Amount, 64)
			if err != nil {
				return 0, fmt.Errorf("invalid commission amount for transaction %s: %w", transaction.OrderID, err)
			}
			totalCommission += math.Abs(amount)
		}
	}
	return totalCommission, nil
}
