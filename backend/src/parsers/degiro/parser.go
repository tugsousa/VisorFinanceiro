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
	OrderDate, OrderTime, ValueDate, Name, ISIN, Description, ExchangeRate, Currency, Amount, BalanceCurrency, BalanceAmount, OrderID string
	RawLine                                                                                                                           string
}

// DeGiroParser implements the parsers.Parser interface for DeGiro files.
type DeGiroParser struct{}

// NewParser creates a new instance of the DeGiroParser.
func NewParser() *DeGiroParser {
	return &DeGiroParser{}
}

func normalizeDecimalString(s string) string {
	// 1. Trim whitespace and quotes
	cleaned := strings.TrimSpace(s)
	cleaned = strings.Trim(cleaned, "\"")

	// 2. Replace comma with a period for the decimal point
	cleaned = strings.ReplaceAll(cleaned, ",", ".")

	return cleaned
}

// Parse reads a DeGiro CSV file and converts its rows into a slice of CanonicalTransaction.
func (p *DeGiroParser) Parse(file io.Reader) ([]models.CanonicalTransaction, error) {
	// --- CSV Reading Logic ---
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
				OrderDate:       record[0],
				OrderTime:       record[1],
				ValueDate:       record[2],
				Name:            record[3],
				ISIN:            record[4],
				Description:     record[5],
				ExchangeRate:    record[6],
				Currency:        record[7],
				Amount:          record[8],
				BalanceCurrency: record[9],
				BalanceAmount:   record[10],
				OrderID:         record[11],
				RawLine:         strings.Join(record, ","),
			})
		}
	}

	// --- FIX: Reverse rawTxs to ensure Chronological Order (Oldest -> Newest) ---
	// Degiro exports are Newest-First. We reverse them so they are inserted into the DB
	// as Oldest-First. This ensures that when we sort by ID ASC later, we process
	// the day's timeline correctly, ending with the latest balance.
	for i, j := 0, len(rawTxs)-1; i < j; i, j = i+1, j-1 {
		rawTxs[i], rawTxs[j] = rawTxs[j], rawTxs[i]
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

		if txType == "COMMISSION_IGNORE" {
			continue
		}

		if txType == "UNKNOWN" {
			log.Printf("DeGiro Parser: Skipping unknown transaction type for description: '%s'", raw.Description)
			continue
		}

		normalizedAmount := normalizeDecimalString(raw.Amount)
		sourceAmt, _ := strconv.ParseFloat(normalizedAmount, 64)
		finalAmount := sourceAmt

		if txType == "FEE" || (txType == "DIVIDEND" && subType == "TAX") {
			finalAmount = -math.Abs(sourceAmt)
		}

		commission, _ := findCommissionForOrder(raw.OrderID, rawTxs)

		// --- Extract Balance ---
		var cashBalance float64
		var hasBalance bool

		if raw.BalanceAmount != "" {
			normalizedBalance := normalizeDecimalString(raw.BalanceAmount)
			if bal, err := strconv.ParseFloat(normalizedBalance, 64); err == nil {
				cashBalance = bal
				hasBalance = true
			}
		}

		tx := models.CanonicalTransaction{
			Source:             "degiro",
			TransactionDate:    date,
			ProductName:        productName,
			ISIN:               strings.TrimSpace(raw.ISIN),
			Quantity:           quantity,
			Price:              price,
			Currency:           raw.Currency,
			OrderID:            raw.OrderID,
			RawText:            raw.RawLine,
			SourceAmount:       sourceAmt,
			Amount:             finalAmount,
			TransactionType:    txType,
			TransactionSubType: subType,
			BuySell:            buySell,
			Commission:         commission,
			// Balance Fields
			CashBalance:     cashBalance,
			BalanceCurrency: raw.BalanceCurrency,
			HasBalance:      hasBalance,
		}
		canonicalTxs = append(canonicalTxs, tx)
	}

	return canonicalTxs, nil
}

func classifyDeGiroTransaction(raw RawTransaction) (txType, subType, buySell, productName string, quantity, price float64) {
	desc := strings.TrimSpace(strings.ReplaceAll(raw.Description, "\u00A0", " "))
	lowerDesc := strings.ToLower(desc)

	if strings.EqualFold(lowerDesc, "juros") {
		return "FEE", "INTEREST", "", desc, 0, 0
	}

	if strings.Contains(lowerDesc, "comissões de transação") {
		return "COMMISSION_IGNORE", "", "", "", 0, 0
	}
	if strings.Contains(lowerDesc, "custo de conectividade") {
		return "FEE", "", "", desc, 0, 0
	}

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
	if strings.EqualFold(lowerDesc, "levantamento") || strings.Contains(lowerDesc, "flatex withdrawal") {
		return "CASH", "WITHDRAWAL", "", "Cash Withdrawal", 0, 0
	}

	if strings.Contains(lowerDesc, "mudança de produto") {
		return "PRODUCT_CHANGE", "", "", "Product Change", 0, 0
	}

	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+([\d\s.,]+)\s+(.+?)\s*@([\d,.]+)`)
	matches := stockOrOptionRe.FindStringSubmatch(desc)
	if matches == nil {
		return "UNKNOWN", "", "", "", 0, 0
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
			normalizedAmount := normalizeDecimalString(transaction.Amount)
			amount, err := strconv.ParseFloat(normalizedAmount, 64)
			if err != nil {
				return 0, fmt.Errorf("invalid commission amount for transaction %s: %w", transaction.OrderID, err)
			}
			totalCommission += math.Abs(amount)
		}
	}
	return totalCommission, nil
}
