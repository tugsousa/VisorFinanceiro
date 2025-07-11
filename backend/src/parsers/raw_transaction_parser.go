// backend/src/parsers/raw_transaction_parser.go
package parsers

import (
	"fmt"
	"regexp" // Keep for parseDescription
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"          // For GetExchangeRate
	"github.com/username/taxfolio/backend/src/security/validation" // IMPORT THE VALIDATION PACKAGE
	"github.com/username/taxfolio/backend/src/utils"
)

type transactionProcessorImpl struct{}

func NewTransactionProcessor() TransactionProcessor {
	return &transactionProcessorImpl{}
}

// validateAndSanitizeRawTransaction performs detailed validation and sanitization on a single raw transaction.
// It returns a sanitized version of the raw transaction or an error.
// This function centralizes the validation logic for a RawTransaction.
func validateAndSanitizeRawTransaction(raw models.RawTransaction) (models.RawTransaction, error) {
	var sanitizedRaw = raw
	var err error
	contextID := fmt.Sprintf("RawOrderID: '%s', RawName: '%s', RawDesc: '%s'", raw.OrderID, raw.Name, raw.Description) // Added RawDesc for context

	// ... (validations for OrderDate, OrderTime, ValueDate) ...
	// Note: The original file snippet didn't show these validations, so I'm keeping it as such.
	// If they exist in your actual full file, they would remain here.

	// Name (Product Name / Descritivo from CSV)
	sanitizedRaw.Name = validation.StripUnprintable(strings.TrimSpace(raw.Name))
	if sanitizedRaw.Name != "" {
		if err = validation.ValidateStringMaxLength(sanitizedRaw.Name, validation.MaxProductNameLength, "Name/Descritivo"); err != nil {
			return models.RawTransaction{}, fmt.Errorf("name/descritivo for %s: %w", contextID, err)
		}
		if err = validation.CheckSQLInjectionKeywords(sanitizedRaw.Name, "Name/Descritivo", contextID); err != nil {
			return models.RawTransaction{}, err
		}
		if err = validation.CheckXSSPatterns(sanitizedRaw.Name, "Name/Descritivo", contextID); err != nil {
			return models.RawTransaction{}, err
		}
		if err = validation.CheckFormulaInjection(sanitizedRaw.Name, "Name/Descritivo", contextID); err != nil {
			return models.RawTransaction{}, err
		}
	} else {
		logger.L.Debug("Raw 'Name/Descritivo' field is empty.", "contextID", contextID)
	}

	// ... (validations for ISIN) ...
	// Note: The original file snippet didn't show these validations, so I'm keeping it as such.

	// Description (Tipo Transacao from CSV)
	sanitizedRaw.Description = validation.StripUnprintable(strings.TrimSpace(raw.Description))
	if err = validation.ValidateStringNotEmpty(sanitizedRaw.Description, "Transaction Type/Description"); err != nil {
		return models.RawTransaction{}, fmt.Errorf("transaction type/description for %s: %w", contextID, err)
	}
	if err = validation.ValidateStringMaxLength(sanitizedRaw.Description, validation.MaxDescriptionLength, "Transaction Type/Description"); err != nil {
		return models.RawTransaction{}, fmt.Errorf("transaction type for %s: %w", contextID, err)
	}
	if err = validation.CheckSQLInjectionKeywords(sanitizedRaw.Description, "Transaction Type/Description", contextID); err != nil {
		return models.RawTransaction{}, err
	}
	if err = validation.CheckXSSPatterns(sanitizedRaw.Description, "Transaction Type/Description", contextID); err != nil {
		return models.RawTransaction{}, err
	}
	if err = validation.CheckFormulaInjection(sanitizedRaw.Description, "Transaction Type/Description", contextID); err != nil {
		return models.RawTransaction{}, err
	}

	// ... (validations for ExchangeRate, Currency, Amount, OrderID) ...
	// Note: The original file snippet didn't show these validations, so I'm keeping it as such.
	// Example for Amount if it existed:
	// if raw.Amount != "" { // Only validate if not empty, assuming amount can sometimes be empty for certain tx types
	//  _, err = validation.ValidateFloatString(raw.Amount, "Amount", true, -1e12, 1e12) // Allow negative, wide range
	//  if err != nil {
	//      return models.RawTransaction{}, fmt.Errorf("amount for %s: %w", contextID, err)
	//  }
	//  sanitizedRaw.Amount = strings.TrimSpace(raw.Amount) // Keep as string after validation
	// } else {
	//  sanitizedRaw.Amount = "" // Ensure it's an empty string if originally empty
	// }

	return sanitizedRaw, nil
}

func (p *transactionProcessorImpl) Process(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error) {
	overallStartTime := time.Now()
	logger.L.Info("transactionProcessor.Process START", "rawTransactionCount", len(rawTransactions))
	var processedTransactions []models.ProcessedTransaction

	for i, raw := range rawTransactions {
		loopStartTime := time.Now()

		sanitizedRaw, err := validateAndSanitizeRawTransaction(raw)
		if err != nil {
			logger.L.Error("Validation/Sanitization failed for raw transaction, skipping.", "index", i, "originalOrderID", raw.OrderID, "error", err)
			return nil, fmt.Errorf("error processing raw transaction at index %d (Original OrderID: %s): %w", i, raw.OrderID, err)
		}

		orderType, quantity, price, _, parsedName, err := parseDescription(sanitizedRaw.Description)
		if err != nil {
			logger.L.Warn("Skipping transaction due to parseDescription error", "originalOrderID", sanitizedRaw.OrderID, "error", err)
			continue
		}

		if orderType == "productchange" {
			logger.L.Info("Skipping administrative 'Product Change' transaction", "originalOrderID", sanitizedRaw.OrderID)
			continue
		}
		var amount float64
		if sanitizedRaw.Amount == "" {
			if orderType == "cashdeposit" {
				logger.L.Error("Empty amount for 'Depósito' transaction", "originalOrderID", sanitizedRaw.OrderID)
				return nil, fmt.Errorf("empty amount for 'Depósito' transaction (OrderID: %s)", sanitizedRaw.OrderID)
			}
			logger.L.Debug("Empty amount for non-cashdeposit transaction", "orderType", orderType, "originalOrderID", sanitizedRaw.OrderID)
			amount = 0
		} else {
			amount, err = strconv.ParseFloat(sanitizedRaw.Amount, 64)
			if err != nil {
				logger.L.Error("Internal error: Failed to parse pre-validated amount string", "originalOrderID", sanitizedRaw.OrderID, "amountStr", sanitizedRaw.Amount, "error", err)
				return nil, fmt.Errorf("internal error parsing amount for OrderID %s: %w", sanitizedRaw.OrderID, err)
			}
		}

		if orderType == "cashdeposit" {
			processed := models.ProcessedTransaction{
				Date:         sanitizedRaw.ValueDate,
				ProductName:  parsedName,
				ISIN:         sanitizedRaw.ISIN,
				Quantity:     0,
				Price:        0,
				OrderType:    orderType,
				Description:  sanitizedRaw.Description,
				Amount:       amount,
				Currency:     sanitizedRaw.Currency,
				Commission:   0,
				OrderID:      sanitizedRaw.OrderID,
				ExchangeRate: 1.0,
				AmountEUR:    amount,
				CountryCode:  utils.GetCountryCodeString(sanitizedRaw.ISIN),
			}
			processedTransactions = append(processedTransactions, processed)
			logger.L.Debug("Processed cash deposit", "index", i, "originalOrderID", sanitizedRaw.OrderID, "duration", time.Since(loopStartTime))
			continue
		}

		transactionDate, dateParseErr := time.Parse("02-01-2006", sanitizedRaw.OrderDate)
		if dateParseErr != nil {
			logger.L.Error("Internal error: Failed to parse pre-validated OrderDate", "dateStr", sanitizedRaw.OrderDate, "error", dateParseErr)
			return nil, fmt.Errorf("internal error parsing pre-validated OrderDate %s", sanitizedRaw.OrderDate)
		}

		// MODIFIED SECTION for exchange rate handling
		exchangeRateValue := 1.0 // Default to 1.0
		if sanitizedRaw.Currency != "EUR" {
			rate, err := processors.GetExchangeRate(sanitizedRaw.Currency, transactionDate)
			if err != nil {
				logger.L.Warn("Unable to retrieve exchange rate (or no prior rate found), defaulting to 1.0",
					"currency", sanitizedRaw.Currency, "date", sanitizedRaw.OrderDate, "originalOrderID", sanitizedRaw.OrderID, "error", err)
				// exchangeRateValue remains 1.0
			} else if rate <= 0 { // Also check if the rate itself is non-positive (e.g. data error)
				logger.L.Warn("Retrieved exchange rate is non-positive, defaulting to 1.0 to avoid issues.",
					"currency", sanitizedRaw.Currency, "date", sanitizedRaw.OrderDate, "originalOrderID", sanitizedRaw.OrderID, "retrievedRate", rate)
				// exchangeRateValue remains 1.0
			} else {
				exchangeRateValue = rate
			}
		}

		amountEUR := amount                 // By default, if currency is EUR or if conversion fails and we fallback
		if sanitizedRaw.Currency != "EUR" { // Calculate AmountEUR only if not EUR
			if exchangeRateValue == 0 { // This should be a rare, unexpected case now
				logger.L.Error("Critical: Exchange rate value became 0 for non-EUR currency before conversion. This should not happen. Using original amount.",
					"orderID", sanitizedRaw.OrderID, "currency", sanitizedRaw.Currency)
				// amountEUR remains 'amount' as per initialization above - this is the fallback.
			} else {
				amountEUR = amount / exchangeRateValue
			}
		}
		// END OF MODIFIED SECTION

		commission := 0.0 // Commission calculation remains 0.0 as per previous logic state

		productNameForProcessedTx := parsedName
		if orderType == "dividend" || orderType == "dividendtax" {
			productNameForProcessedTx = sanitizedRaw.Name
		}

		processed := models.ProcessedTransaction{
			Date:             sanitizedRaw.OrderDate,
			ProductName:      productNameForProcessedTx,
			ISIN:             sanitizedRaw.ISIN,
			Quantity:         quantity,
			OriginalQuantity: quantity,
			Price:            price,
			OrderType:        orderType,
			TransactionType:  determineTransactionType(orderType),
			Description:      sanitizedRaw.Description,
			Amount:           amount,
			Currency:         sanitizedRaw.Currency,
			Commission:       commission,
			OrderID:          sanitizedRaw.OrderID,
			ExchangeRate:     exchangeRateValue, // Store the rate that was actually used
			AmountEUR:        amountEUR,
			CountryCode:      utils.GetCountryCodeString(sanitizedRaw.ISIN),
		}
		processedTransactions = append(processedTransactions, processed)

		if (i+1)%100 == 0 || i == len(rawTransactions)-1 {
			logger.L.Debug("Processed batch of raw transactions", "currentIndex", i+1, "total", len(rawTransactions), "lastOrderID", sanitizedRaw.OrderID, "batchLoopDuration", time.Since(loopStartTime))
		}
	}
	logger.L.Info("transactionProcessor.Process END", "processedCount", len(processedTransactions), "totalDuration", time.Since(overallStartTime))
	return processedTransactions, nil
}

func parseDescription(description string) (orderType string, quantity int, price float64, isin string, name string, err error) {
	desc := strings.ReplaceAll(description, "\u00A0", " ")
	desc = strings.TrimSpace(desc)

	if strings.Contains(strings.ToLower(desc), "mudança de produto") {
		return "productchange", 0, 0, "", "Product Change Event", nil
	}

	if desc == "Depósito" || strings.EqualFold(desc, "flatex Deposit") {
		return "cashdeposit", 0, 0, "", "Cash Deposit", nil
	}

	dividendRe := regexp.MustCompile(`(?i)^(Dividendo|Imposto sobre Dividendo)\s+(.+?)(?:\s+\(.+\))?$`)
	dividendMatches := dividendRe.FindStringSubmatch(desc)
	if dividendMatches != nil {
		productName := strings.TrimSpace(dividendMatches[2])
		if strings.HasPrefix(strings.ToLower(desc), "imposto sobre dividendo") {
			return "dividendtax", 0, 0, "", productName, nil
		}
		return "dividend", 0, 0, "", productName, nil
	}
	if strings.EqualFold(desc, "Dividendo") {
		return "dividend", 0, 0, "", "", nil
	}
	if strings.EqualFold(desc, "Imposto sobre Dividendo") {
		return "dividendtax", 0, 0, "", "", nil
	}

	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+(\d+\s*\d*)\s+([a-zA-Z0-9\s\.\-\(\)]+\s+[CP]\d+(?:\.\d+)?\s+\d{2}[A-Z]{3}\d{2}|[a-zA-Z0-9\s\.\-\(\)]+)\s*@([\d,]+)\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)
	matches := stockOrOptionRe.FindStringSubmatch(desc)

	if matches == nil {
		// Attempt a simpler match for transactions like "Comissões de transação DEGIRO e/ou taxas de terceiros"
		// or other non-trade descriptions that don't fit the complex pattern.
		// This part can be expanded based on other known non-trade descriptions.
		if strings.Contains(strings.ToLower(desc), "comissões de transação") || strings.Contains(strings.ToLower(desc), "custo de conectividade") {
			// These are often fees and might not have quantity/price in the description
			// but might be linked to an OrderID. The main Process loop should handle amount/commission logic.
			// For now, we can mark it as a 'fee' type if that helps categorization.
			// Or, if these are always associated with another transaction, they might be handled by CalculateCommission directly.
			// Returning an empty orderType might cause the transaction to be skipped if not handled.
			// Let's return a generic 'fee' orderType. The Process function should check if amount is populated.
			return "fee", 0, 0, "", "Fee/Commission", nil // Parsed name can be generic
		}
		// Add more specific non-trade patterns here if needed.
		// E.g., "Degiro Cash Sweep Transfer"
		if strings.Contains(strings.ToLower(desc), "degiro cash sweep transfer") {
			return "cashsweep", 0, 0, "", "Cash Sweep Transfer", nil
		}

		return "", 0, 0, "", "", fmt.Errorf("unknown transaction format in description: '%s'", description)
	}

	orderTypeStr := strings.ToLower(matches[1])
	quantityStr := strings.ReplaceAll(matches[2], " ", "")
	productNameStr := strings.TrimSpace(matches[3])
	priceStr := strings.ReplaceAll(matches[4], ",", ".")

	parsedISIN := ""
	if len(matches) > 6 {
		parsedISIN = strings.TrimSpace(matches[6])
	}

	qty, qErr := strconv.Atoi(quantityStr)
	if qErr != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid quantity '%s' in description: %w", quantityStr, qErr)
	}

	p, pErr := strconv.ParseFloat(priceStr, 64)
	if pErr != nil {
		return "", 0, 0, "", "", fmt.Errorf("invalid price '%s' in description: %w", priceStr, pErr)
	}

	optionPatternRe := regexp.MustCompile(`(?i)^[A-Z0-9\s\.]+?\s+[CP]\d+(\.\d+)?\s+\d{2}[A-Z]{3}\d{2}$`)
	finalOrderType := ""
	if optionPatternRe.MatchString(productNameStr) {
		finalOrderType = "option"
	} else {
		if orderTypeStr == "compra" {
			finalOrderType = "stockbuy"
		} else {
			finalOrderType = "stocksale"
		}
	}

	return finalOrderType, qty, p, parsedISIN, productNameStr, nil
}

func determineTransactionType(orderType string) string {
	switch strings.ToLower(orderType) {
	case "stockbuy", "stocksale":
		return "STOCK"
	case "option":
		return "OPTION"
	case "dividend", "dividendtax":
		return "DIVIDEND"
	case "cashdeposit":
		return "CASH_MOVEMENT"
	case "fee", "commission": // if parseDescription identifies these
		return "FEE"
	case "cashsweep": // if parseDescription identifies these
		return "CASH_SWEEP" // Or a more generic type if preferred
	default:
		logger.L.Warn("Unknown order type for transaction type determination", "orderType", orderType)
		return "UNKNOWN"
	}
}
