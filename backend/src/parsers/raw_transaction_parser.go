package parsers

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/utils"
)

type transactionProcessorImpl struct{}

func NewTransactionProcessor() TransactionProcessor {
	return &transactionProcessorImpl{}
}

func (p *transactionProcessorImpl) Process(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error) {
	overallStartTime := time.Now()
	log.Printf("transactionProcessor.Process START for %d raw transactions", len(rawTransactions))
	var processedTransactions []models.ProcessedTransaction

	for i, raw := range rawTransactions { // Added index 'i'
		loopStartTime := time.Now() // For timing each outer loop iteration

		orderType, quantity, price, _, name, err := parseDescription(raw.Description)
		if err != nil {
			log.Printf("Warning: Skipping transaction due to parseDescription error (OrderID: %s): %v", raw.OrderID, err)
			continue
		}

		var amount float64
		trimmedAmount := strings.TrimSpace(raw.Amount)

		if trimmedAmount == "" {
			if orderType == "cashdeposit" {
				return nil, fmt.Errorf("empty amount for 'Depósito' transaction (OrderID: %s)", raw.OrderID)
			} else {
				log.Printf("Warning: Skipping transaction with empty amount and description '%s' (OrderID: %s)", raw.Description, raw.OrderID)
				continue
			}
		} else {
			var parseErr error
			amount, parseErr = strconv.ParseFloat(trimmedAmount, 64)
			if parseErr != nil {
				return nil, fmt.Errorf("invalid amount format '%s' for transaction with description '%s' (OrderID: %s): %w", raw.Amount, raw.Description, raw.OrderID, parseErr)
			}
		}

		if orderType == "cashdeposit" {
			processed := models.ProcessedTransaction{
				Date:         raw.ValueDate,
				ProductName:  name,
				ISIN:         raw.ISIN,
				Quantity:     0,
				Price:        0,
				OrderType:    orderType,
				Amount:       amount,
				Currency:     raw.Currency,
				Commission:   0,
				OrderID:      raw.OrderID,
				ExchangeRate: 1.0,
				AmountEUR:    amount,
			}
			processedTransactions = append(processedTransactions, processed)
			// Log timing for this iteration before continuing
			if i%100 == 0 || i == len(rawTransactions)-1 {
				log.Printf("  Processed raw transaction %d/%d (Cash Deposit). Loop iteration took: %s", i+1, len(rawTransactions), time.Since(loopStartTime))
			}
			continue
		}

		transactionDate, dateParseErr := time.Parse("02-01-2006", raw.OrderDate)
		if dateParseErr != nil {
			// Log and potentially skip or handle, but don't return immediately for the whole batch
			log.Printf("Warning: Invalid date format for transaction %s: %v. Exchange rate calculation might be affected.", raw.OrderID, dateParseErr)
			// Set a zero time or handle accordingly if transactionDate is used later and needs to be valid
		}

		exchangeRate := 1.0
		if raw.Currency != "EUR" && dateParseErr == nil { // Only try if date parsing was successful
			var exErr error // Shadowing 'err' from parseDescription is fine here
			exchangeRate, exErr = processors.GetExchangeRate(raw.Currency, transactionDate)
			if exErr != nil {
				log.Printf("Warning: Unable to retrieve exchange rate for currency %s and date %s (OrderID: %s). Using default 1.0. Error: %v",
					raw.Currency, raw.OrderDate, raw.OrderID, exErr)
				// exchangeRate remains 1.0
			}
		} else if dateParseErr != nil {
			log.Printf("Skipping exchange rate fetch for OrderID %s due to date parse error.", raw.OrderID)
		}

		var amountEUR float64
		if exchangeRate == 0.0 { // Should ideally not happen if default is 1.0
			log.Printf("Warning: Exchange rate is zero for transaction %s (Currency: %s, Date: %s). Using original amount for AmountEUR.",
				raw.OrderID, raw.Currency, raw.OrderDate)
			amountEUR = amount
		} else {
			amountEUR = amount / exchangeRate
		}

		// --- Commission Calculation Section ---
		// As per your request, keeping commission at 0.0 for now and removing the problematic loop.
		// The inefficient inner loop has been removed.
		commission := 0.0
		// The old log for the inner loop is also removed.
		// The `err` variable from parseDescription is still in scope,
		// but the `if err != nil` for commission calculation was likely not intended to use that specific error.
		// For now, we'll assume no specific error logging for commission since it's 0.0.

		productNameForProcessed := name
		if orderType == "dividend" || orderType == "dividendtax" {
			productNameForProcessed = raw.Name
		}

		processed := models.ProcessedTransaction{
			Date:             raw.OrderDate,
			ProductName:      productNameForProcessed,
			ISIN:             raw.ISIN,
			Quantity:         quantity,
			OriginalQuantity: quantity,
			Price:            price,
			OrderType:        orderType,
			TransactionType:  "", // You might want to derive this (e.g. "STOCK", "OPTION", "DIVIDEND", "CASH")
			Description:      raw.Description,
			Amount:           amount,
			Currency:         raw.Currency,
			Commission:       commission,
			OrderID:          raw.OrderID,
			ExchangeRate:     exchangeRate,
			AmountEUR:        amountEUR,
			CountryCode:      utils.GetCountryCodeString(raw.ISIN),
		}
		processedTransactions = append(processedTransactions, processed)

		// Log progress for each outer loop iteration
		if i%100 == 0 || i == len(rawTransactions)-1 { // Log every 100 or the last one
			log.Printf("  Processed raw transaction %d/%d. Loop iteration took: %s", i+1, len(rawTransactions), time.Since(loopStartTime))
		}
	}
	log.Printf("transactionProcessor.Process END. Total time: %s for %d processed transactions", time.Since(overallStartTime), len(processedTransactions))
	return processedTransactions, nil
}

// convertRawToProcessed function (as you provided it, with minor logging improvement for date parse)
func convertRawToProcessed(raw models.RawTransaction) (models.ProcessedTransaction, error) {
	orderType, quantity, price, _, name, err := parseDescription(raw.Description)
	if err != nil {
		return models.ProcessedTransaction{}, fmt.Errorf("convertRawToProcessed: parseDescription failed for OrderID %s: %w", raw.OrderID, err)
	}

	amount, err := strconv.ParseFloat(strings.TrimSpace(raw.Amount), 64)
	if err != nil {
		return models.ProcessedTransaction{}, fmt.Errorf("convertRawToProcessed: invalid amount for OrderID %s: %w", raw.OrderID, err)
	}

	transactionDate, dateParseErr := time.Parse("02-01-2006", raw.OrderDate)
	if dateParseErr != nil {
		// Log this error specifically, as it affects exchange rate fetching.
		log.Printf("Warning (convertRawToProcessed): Invalid date format for transaction %s ('%s'): %v. Exchange rate calculation might be affected.", raw.OrderID, raw.OrderDate, dateParseErr)
		// We'll proceed but exchangeRate might be 1.0 due to this.
	}

	exchangeRate := 1.0
	if raw.Currency != "EUR" && dateParseErr == nil { // Only attempt to get rate if currency is not EUR and date was parsed correctly
		var exErr error
		exchangeRate, exErr = processors.GetExchangeRate(raw.Currency, transactionDate)
		if exErr != nil {
			log.Printf("Warning (convertRawToProcessed): Unable to retrieve exchange rate for OrderID %s (Currency: %s, Date: %s): %v. Using default 1.0.",
				raw.OrderID, raw.Currency, raw.OrderDate, exErr)
			// exchangeRate remains 1.0
		}
	}

	amountEUR := amount
	if exchangeRate != 0 { // Should always be true now since default is 1.0
		amountEUR = amount / exchangeRate
	}

	return models.ProcessedTransaction{
		Date:            raw.OrderDate,
		ProductName:     name,
		ISIN:            raw.ISIN,
		Quantity:        quantity,
		Price:           price,
		OrderType:       orderType,
		TransactionType: "", // Determine if needed
		Description:     raw.Description,
		Amount:          amount,
		Currency:        raw.Currency,
		OrderID:         raw.OrderID,
		ExchangeRate:    exchangeRate,
		AmountEUR:       amountEUR,
		CountryCode:     utils.GetCountryCodeString(raw.ISIN),
	}, nil
}

// parseDescription function remains the same as you provided it.
// ... (paste your parseDescription function here)
func parseDescription(description string) (string, int, float64, string, string, error) {
	// Replace non-breaking spaces with regular spaces
	description = strings.ReplaceAll(description, "\u00A0", " ")
	// Trim leading/trailing whitespace
	description = strings.TrimSpace(description)

	// Check for EXACT deposit transactions first
	if description == "Depósito" || description == "flatex Deposit" {
		// Use 0 for quantity and price as they are not relevant for simple deposits
		return "cashdeposit", 0, 0, "", "Cash Deposit", nil
	}

	// Check for EXACT "Dividendo" transaction first (without product name in description)
	if description == "Dividendo" {
		// Return "dividend" type, but empty name as it's not in the description
		return "dividend", 0, 0, "", "", nil
	}
	// Check for EXACT "Imposto sobre Dividendo" (without product name) - less likely but possible
	if description == "Imposto sobre Dividendo" {
		return "dividendtax", 0, 0, "", "", nil
	}

	// Then check for dividend or tax transactions WITH product name in description
	dividendRe := regexp.MustCompile(`(?i)(?:Dividendo|Imposto sobre Dividendo)\s+(.+?)(?:\s+\(.+\))?$`)
	dividendMatches := dividendRe.FindStringSubmatch(description)
	if dividendMatches != nil {
		productName := strings.TrimSpace(dividendMatches[1])
		// Check the original description again to be sure about tax vs regular dividend
		if strings.Contains(strings.ToLower(description), "imposto sobre dividendo") {
			return "dividendtax", 0, 0, "", productName, nil
		}
		// If the regex matched but it wasn't tax, assume it's a regular dividend
		return "dividend", 0, 0, "", productName, nil
	}

	// Check for Stock Buy/Sell format, as it contains quantity, price, and the product name
	stockRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+(\d+\s*\d*)\s+([a-zA-Z0-9\s\.\-\(\)]+\s+[CP]\d+(?:\.\d+)?\s+\d{2}[A-Z]{3}\d{2}|[a-zA-Z0-9\s\.\-\(\)]+)\s*@([\d,]+)\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)
	matches := stockRe.FindStringSubmatch(description)
	if matches == nil {
		// If it doesn't match deposit, dividend, or stock buy/sell, it's unknown
		return "", 0, 0, "", "", fmt.Errorf("unknown transaction format in description: %s", description)
	}

	// Extract fields from the regex matches
	orderTypeStr := strings.ToLower(matches[1])
	quantityStr := strings.ReplaceAll(matches[2], " ", "")
	name := strings.TrimSpace(matches[3]) // This might be a stock name OR an option name
	priceStr := strings.ReplaceAll(matches[4], ",", ".")
	isin := matches[5] // ISIN might not be present for options

	// Default order type based on compra/venda
	orderType := ""
	if orderTypeStr == "compra" {
		orderType = "stockbuy"
	} else if orderTypeStr == "venda" {
		orderType = "stocksale"
	} else {
		// Should not happen based on regex, but good practice
		return "", 0, 0, "", "", fmt.Errorf("unknown order type string: %s", orderTypeStr)
	}

	// NOW, check if the extracted 'name' matches the option pattern
	optionRe := regexp.MustCompile(`^([A-Z]+)\s+([CP])(\d+(?:\.\d+)?)\s+(\d{2}[A-Z]{3}\d{2})$`)
	if optionRe.MatchString(name) {
		// If the product name matches the option format, override the orderType
		orderType = "option"
	}

	// Parse quantity
	quantityNum, err := strconv.Atoi(quantityStr) // Renamed to quantityNum to avoid conflict
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid quantity: %w", err)
	}

	// Parse price
	if priceStr == "" {
		return "", 0, 0, "", "", fmt.Errorf("price not found in description: %s", description)
	}
	priceNum, err := strconv.ParseFloat(priceStr, 64) // Renamed to priceNum
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid price: %w", err)
	}

	return orderType, quantityNum, priceNum, isin, name, nil
}
