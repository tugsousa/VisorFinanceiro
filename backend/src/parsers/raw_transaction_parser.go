package parsers

import (
	"TAXFOLIO/src/models"
	"TAXFOLIO/src/processors"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// transactionProcessorImpl implements the TransactionProcessor interface.
type transactionProcessorImpl struct{}

// NewTransactionProcessor creates a new instance of TransactionProcessor.
func NewTransactionProcessor() TransactionProcessor {
	return &transactionProcessorImpl{}
}

// Process implements the TransactionProcessor interface.
// It converts raw transactions into processed transactions, including parsing descriptions
// and fetching initial data like exchange rates and commissions.
// NOTE: Dependencies on the 'processors' package here are not ideal for separation of concerns
// and could be refactored further.
func (p *transactionProcessorImpl) Process(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error) {
	var processedTransactions []models.ProcessedTransaction

	for _, raw := range rawTransactions {
		orderType, quantity, price, _, name, err := parseDescription(raw.Description)
		if err != nil {
			// [Keep existing error handling]
			continue
		}

		// Convert Amount to float64
		var amount float64                             // Declare amount variable
		trimmedAmount := strings.TrimSpace(raw.Amount) // Trim whitespace

		if trimmedAmount == "" {
			// If amount is empty, only error out if it was supposed to be a specific "Depósito" transaction.
			// Otherwise, log a warning and skip this transaction.
			if orderType == "cashdeposit" {
				return nil, fmt.Errorf("empty amount for 'Depósito' transaction (OrderID: %s)", raw.OrderID)
			} else {
				log.Printf("Warning: Skipping transaction with empty amount and description '%s' (OrderID: %s)", raw.Description, raw.OrderID)
				continue // Skip to the next transaction
			}
		} else {
			// Parse the amount only if it's not empty
			var parseErr error
			amount, parseErr = strconv.ParseFloat(trimmedAmount, 64)
			if parseErr != nil {
				// Make the error message more informative
				return nil, fmt.Errorf("invalid amount format '%s' for transaction with description '%s' (OrderID: %s): %w", raw.Amount, raw.Description, raw.OrderID, parseErr)
			}
		}

		// Special handling for cash deposits (Description is exactly "Depósito")
		if orderType == "cashdeposit" {
			processed := models.ProcessedTransaction{
				Date:         raw.OrderDate,
				ProductName:  name,
				ISIN:         raw.ISIN,
				Quantity:     0, // Cash deposits have no quantity
				Price:        0, // Cash deposits have no price
				OrderType:    orderType,
				Amount:       amount,
				Currency:     raw.Currency,
				Commission:   0, // No commission for deposits
				OrderID:      raw.OrderID,
				ExchangeRate: 1.0,    // Fixed for EUR deposits
				AmountEUR:    amount, // Same as amount for EUR deposits
			}
			processedTransactions = append(processedTransactions, processed)
			continue // Skip further processing for deposits
		}

		// [Rest of your existing processing logic for non-deposit transactions]
		transactionDate, err := time.Parse("02-01-2006", raw.OrderDate)
		if err != nil {
			return nil, fmt.Errorf("invalid date format for transaction %s: %w", raw.OrderID, err)
		}

		// Get exchange rate (skip for EUR)
		exchangeRate := 1.0
		if raw.Currency != "EUR" {
			exchangeRate, err = processors.GetExchangeRate(raw.Currency, transactionDate)
			if err != nil {
				log.Printf("Warning: Unable to retrieve exchange rate for currency %s and date %s. Using default value of 1.0. Error: %v",
					raw.Currency, raw.OrderDate, err)
			}
		}

		// Calculate AmountEUR, ensuring exchangeRate is not zero
		var amountEUR float64
		if exchangeRate == 0.0 {
			log.Printf("Warning: Exchange rate is zero for transaction %s (Currency: %s, Date: %s). Using original amount for AmountEUR.",
				raw.OrderID, raw.Currency, raw.OrderDate)
			amountEUR = amount // Avoid division by zero, assume 1:1
		} else {
			amountEUR = amount / exchangeRate
		}

		// Calculate Commission (skip for deposits)
		commission, err := processors.CalculateCommission(raw.OrderID, rawTransactions)
		if err != nil {
			log.Printf("Error calculating commission for transaction %s: %v", raw.OrderID, err)
		}

		processed := models.ProcessedTransaction{
			Date:             raw.OrderDate,
			ProductName:      name,
			ISIN:             raw.ISIN,
			Quantity:         quantity,
			OriginalQuantity: quantity, // Set OriginalQuantity to the initial quantity
			Price:            price,
			OrderType:        orderType,
			Amount:           amount,
			Currency:         raw.Currency,
			Commission:       commission,
			OrderID:          raw.OrderID,
			ExchangeRate:     exchangeRate,
			AmountEUR:        amountEUR,
			Description:      raw.Description, // Copy the original description
		}

		processedTransactions = append(processedTransactions, processed)
	}
	return processedTransactions, nil
}

// parseDescription extracts OrderType, Quantity, Price, ISIN, and Name from the Description field.
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

	// Then check for dividend or tax transactions (using Contains is okay here)
	if strings.Contains(strings.ToLower(description), "dividendo") {
		if strings.Contains(strings.ToLower(description), "imposto sobre dividendo") {
			return "dividendtax", 0, 0, "", "", nil
		}
		return "dividend", 0, 0, "", "", nil
	}

	// Check for Stock Buy/Sell format FIRST, as it contains quantity, price, and the product name
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
	quantity, err := strconv.Atoi(quantityStr)
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid quantity: %w", err)
	}

	// Parse price
	if priceStr == "" {
		return "", 0, 0, "", "", fmt.Errorf("price not found in description: %s", description)
	}
	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid price: %w", err)
	}

	return orderType, quantity, price, isin, name, nil
}
