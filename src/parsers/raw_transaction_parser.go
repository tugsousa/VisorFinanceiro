package parsers

import (
	"TAXFOLIO/models"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
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
		orderType, quantity, price, isin, name, err := parseDescription(raw.Description)
		if err != nil {
			// Check if the description is in the skipLoggingDescriptions list
			shouldSkipLogging := false
			for _, desc := range skipLoggingDescriptions {
				if strings.Contains(raw.Description, desc) {
					shouldSkipLogging = true
					break
				}
			}

			// Log the error only if it's not in the skipLoggingDescriptions list
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

		// Convert ExchangeRate to float64 (default to 1 if empty or invalid)
		exchangeRate := 1.0 // Default value
		if raw.ExchangeRate != "" {
			exchangeRate, err = strconv.ParseFloat(raw.ExchangeRate, 64)
			if err != nil {
				// If ExchangeRate is invalid, log a warning but continue with the default value
				fmt.Printf("Warning: Invalid exchange rate for transaction %s. Using default value of 1.\n", raw.OrderID)
			}
		}

		// Calculate AmountEUR
		amountEUR := amount / exchangeRate

		// If ISIN is empty, use the ISIN from the raw transaction
		if isin == "" {
			isin = raw.ISIN
		}

		// Create a ProcessedTransaction
		processed := models.ProcessedTransaction{
			Date:         raw.OrderDate,
			ProductName:  name,
			ISIN:         isin,
			Quantity:     quantity,
			Price:        price,
			OrderType:    orderType,
			Amount:       amount,
			Currency:     raw.Currency,
			Commission:   0.0, // Default commission (you can parse this from the Description if needed)
			OrderID:      raw.OrderID,
			ExchangeRate: exchangeRate,
			AmountEUR:    amountEUR,
		}

		// Add to the result slice
		processedTransactions = append(processedTransactions, processed)
	}
	return processedTransactions, nil
}

// parseDescription extracts OrderType, Quantity, Price, ISIN, and Name from the Description field.
func parseDescription(description string) (string, int, float64, string, string, error) {

	// Check if the description is "Dividendo" or "Imposto sobre dividendo"
	if strings.Contains(strings.ToLower(description), "dividendo") {
		if strings.Contains(strings.ToLower(description), "imposto sobre dividendo") {
			return "imposto sobre dividendo", 0, 0, "", "", nil
		}
		return "dividendo", 0, 0, "", "", nil
	}

	// Example Description: "Compra 48 Vanguard FTSE All-World High Div Yield UCITS USD@64,68 EUR (IE00B8GKDB10)"

	re := regexp.MustCompile(`(?i)\s*(compra|venda)\s+([\d\s]+)\s+([a-zA-Z0-9\s\.\-\(\)]+)(?:@([\d,]+))?\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)

	matches := re.FindStringSubmatch(description)
	if matches == nil {
		return "", 0, 0, "", "", fmt.Errorf("unknown transaction format in description: %s", description)
	}

	// Extract fields from the regex matches
	orderType := strings.ToLower(matches[1])               // "compra" or "venda"
	quantityStr := strings.ReplaceAll(matches[2], " ", "") // Remove spaces
	priceStr := strings.ReplaceAll(matches[4], ",", ".")   // Replace comma with dot
	name := strings.TrimSpace(matches[3])                  // Product name
	isin := matches[5]                                     // ISIN (optional)

	// Parse quantity
	quantity, err := strconv.Atoi(quantityStr)
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid quantity: %w", err)
	}

	// Parse price (if available)
	if priceStr == "" {
		return "", 0, 0, "", "", fmt.Errorf("price not found in description: %s", description)
	}
	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid price: %w", err)
	}

	return orderType, quantity, price, isin, name, nil
}
