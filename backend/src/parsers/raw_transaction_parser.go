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

// ParseProcessedTransactions converts a slice of RawTransaction into a slice of ProcessedTransaction.
func ParseProcessedTransactions(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error) {
	var processedTransactions []models.ProcessedTransaction

	// List of descriptions to skip logging errors for
	skipLoggingDescriptions := []string{
		"Crédito de divisa",
		"Levantamento de divisa",
		"Comissões de transação DEGIRO e/ou taxas de terceiros",
		"Conversão do Fundo do Mercado",
		"Depósito",
		"Custo de Conectividade DEGIRO",
		"Imposto de selo Londres/Dublin",
		"Alteração do preço do Fundo do Mercado",
		"Juros",
		"Degiro Cash Sweep Transfer",
		"Flatex Interest",
		"Levantamentos da sua Conta Caixa na",
		"flatex Deposit",
		"ADR/GDR Pass-Through Fee",
		"flatex Deposit",
		"Exchange Connection Fee",
		"Cost of Stock",
		"Exercise and Assignment",
		"DEGIRO courtesy",
	}

	for _, raw := range rawTransactions {
		// Parse the Description field to extract OrderType, Quantity, Price, ISIN, and Name
		orderType, quantity, price, _, name, err := parseDescription(raw.Description)
		if err != nil {
			// Check if the description is in the skipLoggingDescriptions list
			shouldSkipLogging := false
			for _, desc := range skipLoggingDescriptions {
				if strings.Contains(raw.Description, desc) {
					shouldSkipLogging = true
					break
				}
			}

			if !shouldSkipLogging {
				log.Printf("Skipping transaction due to parse error: %v", err)
			}
			continue
		}

		// Convert Amount to float64
		amount, err := strconv.ParseFloat(raw.Amount, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid amount for transaction %s: %w", raw.OrderID, err)
		}

		// If amount is 0 but we have quantity and price, calculate it
		if amount == 0 && quantity != 0 && price != 0 {
			amount = float64(quantity) * price
			if orderType == "venda" {
				amount = -amount // Sales should be negative amounts
			}
		}

		// Parse the transaction date
		transactionDate, err := time.Parse("02-01-2006", raw.OrderDate)
		if err != nil {
			return nil, fmt.Errorf("invalid date format for transaction %s: %w", raw.OrderID, err)
		}

		// Get the exchange rate for the transaction's currency and date
		exchangeRate, err := processors.GetExchangeRate(raw.Currency, transactionDate)
		if err != nil {
			log.Printf("Warning: Unable to retrieve exchange rate for currency %s and date %s. Using default value of 1.0. Error: %v",
				raw.Currency, raw.OrderDate, err)
			exchangeRate = 1.0
		}

		// Calculate AmountEUR
		amountEUR := amount / exchangeRate

		// If amountEUR is 0 but we have quantity and price, calculate it
		if amountEUR == 0 && quantity != 0 && price != 0 {
			amountEUR = float64(quantity) * price
			if orderType == "venda" {
				amountEUR = -amountEUR // Sales should be negative amounts
			}
		}

		// Calculate Commission
		commission, err := processors.CalculateCommission(raw.OrderID, rawTransactions)
		if err != nil {
			log.Printf("Error calculating commission for transaction %s: %v", raw.OrderID, err)
		}

		// Create a ProcessedTransaction
		processed := models.ProcessedTransaction{
			Date:         raw.OrderDate,
			ProductName:  name,
			ISIN:         raw.ISIN,
			Quantity:     quantity,
			Price:        price,
			OrderType:    orderType,
			Amount:       amount,
			Currency:     raw.Currency,
			Commission:   commission,
			OrderID:      raw.OrderID,
			ExchangeRate: exchangeRate,
			AmountEUR:    amountEUR,
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

	// Check for dividend or tax transactions
	if strings.Contains(strings.ToLower(description), "dividendo") {
		if strings.Contains(strings.ToLower(description), "imposto sobre dividendo") {
			return "imposto sobre dividendo", 0, 0, "", "", nil
		}
		return "dividendo", 0, 0, "", "", nil
	}

	re := regexp.MustCompile(`(?i)\s*(compra|venda)\s+(\d+\s*\d*)\s+([a-zA-Z0-9\s\.\-\(\)]+)@([\d,]+)\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)
	matches := re.FindStringSubmatch(description)
	if matches == nil {
		return "", 0, 0, "", "", fmt.Errorf("unknown transaction format in description: %s", description)
	}

	// Extract fields from the regex matches
	orderType := strings.ToLower(matches[1])
	quantityStr := strings.ReplaceAll(matches[2], " ", "")
	priceStr := strings.ReplaceAll(matches[4], ",", ".")
	name := strings.TrimSpace(matches[3])
	isin := matches[5]

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
