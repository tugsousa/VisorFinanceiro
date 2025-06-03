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

	// Name (Product Name / Descritivo from CSV)
	sanitizedRaw.Name = validation.StripUnprintable(strings.TrimSpace(raw.Name))
	// We will NOT call ValidateStringNotEmpty here directly.
	// We will validate its length if it's NOT empty.
	// The decision if an empty name is acceptable will be made later,
	// potentially based on the transaction type derived from raw.Description.
	if sanitizedRaw.Name != "" { // Only apply these checks if the name is not empty
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
		// Optional: Sanitize for formula injection
		// sanitizedRaw.Name = validation.SanitizeForFormulaInjection(sanitizedRaw.Name)
	} else {
		// Name is empty. Log for now, decision to error out will be later.
		logger.L.Debug("Raw 'Name/Descritivo' field is empty.", "contextID", contextID)
	}

	// ... (validations for ISIN) ...

	// Description (Tipo Transacao from CSV)
	sanitizedRaw.Description = validation.StripUnprintable(strings.TrimSpace(raw.Description))
	// Description *usually* should not be empty, as it drives transaction type parsing.
	if err = validation.ValidateStringNotEmpty(sanitizedRaw.Description, "Transaction Type/Description"); err != nil {
		return models.RawTransaction{}, fmt.Errorf("transaction type/description for %s: %w", contextID, err)
	}
	// ... (rest of Description validation: MaxLength, SQLi, XSS, Formula Injection) ...
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

	return sanitizedRaw, nil
}

func (p *transactionProcessorImpl) Process(rawTransactions []models.RawTransaction) ([]models.ProcessedTransaction, error) {
	overallStartTime := time.Now()
	logger.L.Info("transactionProcessor.Process START", "rawTransactionCount", len(rawTransactions))
	var processedTransactions []models.ProcessedTransaction

	for i, raw := range rawTransactions {
		loopStartTime := time.Now()

		// Step 1: Validate and Sanitize the raw transaction data
		sanitizedRaw, err := validateAndSanitizeRawTransaction(raw)
		if err != nil {
			logger.L.Error("Validation/Sanitization failed for raw transaction, skipping.", "index", i, "originalOrderID", raw.OrderID, "error", err)
			// Consider if one bad row should fail the whole batch, or just skip.
			// For now, let's fail the batch to be safe and force clean data.
			return nil, fmt.Errorf("error processing raw transaction at index %d (Original OrderID: %s): %w", i, raw.OrderID, err)
		}

		// Step 2: Use sanitizedRaw for further processing
		orderType, quantity, price, _, parsedName, err := parseDescription(sanitizedRaw.Description) // Use sanitized description
		if err != nil {
			logger.L.Warn("Skipping transaction due to parseDescription error", "originalOrderID", sanitizedRaw.OrderID, "error", err)
			continue
		}

		var amount float64
		// Amount was already validated as a float string if not empty by validateAndSanitizeRawTransaction
		// Now, parse it.
		if sanitizedRaw.Amount == "" {
			if orderType == "cashdeposit" { // From parseDescription
				logger.L.Error("Empty amount for 'Depósito' transaction", "originalOrderID", sanitizedRaw.OrderID)
				return nil, fmt.Errorf("empty amount for 'Depósito' transaction (OrderID: %s)", sanitizedRaw.OrderID)
			}
			// If not cashdeposit and amount is empty, it might be a commission-only row or similar.
			// parseDescription should ideally handle quantity/price for those.
			// For now, if amount is empty and not cashdeposit, we might set amount to 0 or log.
			logger.L.Debug("Empty amount for non-cashdeposit transaction", "orderType", orderType, "originalOrderID", sanitizedRaw.OrderID)
			amount = 0 // Default to 0 if empty and not a deposit
		} else {
			amount, err = strconv.ParseFloat(sanitizedRaw.Amount, 64) // Already validated, should not fail
			if err != nil {
				// This should be rare due to prior validation.
				logger.L.Error("Internal error: Failed to parse pre-validated amount string", "originalOrderID", sanitizedRaw.OrderID, "amountStr", sanitizedRaw.Amount, "error", err)
				return nil, fmt.Errorf("internal error parsing amount for OrderID %s: %w", sanitizedRaw.OrderID, err)
			}
		}

		if orderType == "cashdeposit" {
			processed := models.ProcessedTransaction{
				Date:         sanitizedRaw.ValueDate, // Use validated date
				ProductName:  parsedName,             // From parseDescription
				ISIN:         sanitizedRaw.ISIN,      // Use sanitized ISIN
				Quantity:     0,
				Price:        0,
				OrderType:    orderType,
				Description:  sanitizedRaw.Description, // Store the sanitized full original description
				Amount:       amount,
				Currency:     sanitizedRaw.Currency, // Use sanitized currency
				Commission:   0,
				OrderID:      sanitizedRaw.OrderID, // Use sanitized OrderID
				ExchangeRate: 1.0,                  // Deposits are usually in local currency or already converted
				AmountEUR:    amount,               // Assuming EUR for deposits or direct amount
				CountryCode:  utils.GetCountryCodeString(sanitizedRaw.ISIN),
			}
			processedTransactions = append(processedTransactions, processed)
			logger.L.Debug("Processed cash deposit", "index", i, "originalOrderID", sanitizedRaw.OrderID, "duration", time.Since(loopStartTime))
			continue
		}

		transactionDate, dateParseErr := time.Parse("02-01-2006", sanitizedRaw.OrderDate) // Already validated
		if dateParseErr != nil {
			// Should not happen if ValidateDateString passed
			logger.L.Error("Internal error: Failed to parse pre-validated OrderDate", "dateStr", sanitizedRaw.OrderDate, "error", dateParseErr)
			return nil, fmt.Errorf("internal error parsing pre-validated OrderDate %s", sanitizedRaw.OrderDate)
		}

		exchangeRate := 1.0
		if sanitizedRaw.Currency != "EUR" {
			var exErr error
			exchangeRate, exErr = processors.GetExchangeRate(sanitizedRaw.Currency, transactionDate)
			if exErr != nil {
				logger.L.Warn("Unable to retrieve exchange rate, using 1.0",
					"currency", sanitizedRaw.Currency, "date", sanitizedRaw.OrderDate, "originalOrderID", sanitizedRaw.OrderID, "error", exErr)
				// exchangeRate remains 1.0
			}
		}

		amountEUR := amount
		if exchangeRate != 0 { // Should typically not be 0 if GetExchangeRate is robust or defaults.
			amountEUR = amount / exchangeRate
		} else if sanitizedRaw.Currency != "EUR" {
			logger.L.Warn("Exchange rate is zero, AmountEUR will equal Amount", "originalOrderID", sanitizedRaw.OrderID, "currency", sanitizedRaw.Currency)
		}

		// Commission calculation (remains 0.0 as per previous logic)
		commission := 0.0

		productNameForProcessedTx := parsedName
		// If dividend/tax, the description from raw data is more relevant for ProductName in ProcessedTransaction
		if orderType == "dividend" || orderType == "dividendtax" {
			productNameForProcessedTx = sanitizedRaw.Name // Use sanitized original name for dividends
		}

		processed := models.ProcessedTransaction{
			Date:             sanitizedRaw.OrderDate,
			ProductName:      productNameForProcessedTx,
			ISIN:             sanitizedRaw.ISIN,
			Quantity:         quantity,
			OriginalQuantity: quantity, // Assuming this for now, might need adjustment based on sales later
			Price:            price,
			OrderType:        orderType,
			TransactionType:  determineTransactionType(orderType), // Helper to categorize
			Description:      sanitizedRaw.Description,            // Store the sanitized full original description
			Amount:           amount,
			Currency:         sanitizedRaw.Currency,
			Commission:       commission,
			OrderID:          sanitizedRaw.OrderID,
			ExchangeRate:     exchangeRate,
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

// parseDescription remains largely the same, ensure it handles errors gracefully
// and trims/normalizes inputs it receives.
// Its output (name, orderType) will be used to populate ProcessedTransaction.
func parseDescription(description string) (orderType string, quantity int, price float64, isin string, name string, err error) {
	// It's crucial that this function is robust.
	// The `description` fed to it is already `validation.StripUnprintable` and `strings.TrimSpace`
	// Also, formula injection, XSS, SQLi checks have been done on it.

	// Replace non-breaking spaces just in case, though StripUnprintable might handle some.
	desc := strings.ReplaceAll(description, "\u00A0", " ")
	desc = strings.TrimSpace(desc)

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
	// Handle cases where "Dividendo" or "Imposto sobre Dividendo" might appear without product name directly following
	// For example, if product name is in raw.Name and description is just "Dividendo"
	if strings.EqualFold(desc, "Dividendo") {
		return "dividend", 0, 0, "", "", nil // Name will be taken from raw.Name
	}
	if strings.EqualFold(desc, "Imposto sobre Dividendo") {
		return "dividendtax", 0, 0, "", "", nil // Name will be taken from raw.Name
	}

	// (?i) case-insensitive
	// \s* optional spaces
	// (compra|venda) capture "compra" or "venda"
	// \s+ one or more spaces
	// (\d+\s*\d*) capture quantity (e.g., "10", "1 000")
	// \s+
	// ([^@]+?) capture product name (anything not an "@" symbol, non-greedy)
	// \s*@\s* an "@" symbol surrounded by optional spaces
	// ([\d,\.]+) capture price (digits, commas, dots)
	// (?:s*\(([A-Z0-9]+)\))? optionally capture ISIN in parentheses (e.g. "(US1234567890)")
	// The regex was complex and might need adjustment for different CSV formats.
	// A simpler regex that captures distinct parts if the format is consistent:
	// Example: "Compra 10 SOME STOCK NAME @ 123,45"
	// Example: "Venda 5 OPTION XYZ P30 18MAR22 @ 1,23"
	// The original regex was: stockRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+(\d+\s*\d*)\s+([a-zA-Z0-9\s\.\-\(\)]+\s+[CP]\d+(?:\.\d+)?\s+\d{2}[A-Z]{3}\d{2}|[a-zA-Z0-9\s\.\-\(\)]+)\s*@([\d,]+)\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)
	// This regex tries to match both stocks and options. It can be fragile.
	// Let's simplify and then determine if stock or option.
	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+(\d+\s*\d*)\s+([a-zA-Z0-9\s\.\-\(\)]+\s+[CP]\d+(?:\.\d+)?\s+\d{2}[A-Z]{3}\d{2}|[a-zA-Z0-9\s\.\-\(\)]+)\s*@([\d,]+)\s+([A-Za-z]+)?\s*(?:\(([\w\d]+)\))?$`)
	matches := stockOrOptionRe.FindStringSubmatch(desc)

	if matches == nil {
		return "", 0, 0, "", "", fmt.Errorf("unknown transaction format in description: '%s'", description)
	}

	orderTypeStr := strings.ToLower(matches[1])
	quantityStr := strings.ReplaceAll(matches[2], " ", "") // "1 000" -> "1000"
	productNameStr := strings.TrimSpace(matches[3])
	priceStr := strings.ReplaceAll(matches[4], ",", ".") // "1.234,56" -> "1.234.56" (standardize) or handle Euro format
	// priceStr = strings.ReplaceAll(priceStr, ".", "") // Remove thousands separators if present
	// priceStr = strings.ReplaceAll(priceStr, ",", ".") // Replace decimal comma with dot

	// ISIN is optional in this simplified regex, captured in group 6
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

	// Determine if stock or option based on productNameStr or other indicators
	// This is a common pattern for options "PRODUCT C/P STRIKE DDMMMYY"
	optionPatternRe := regexp.MustCompile(`(?i)^[A-Z0-9\s\.]+?\s+[CP]\d+(\.\d+)?\s+\d{2}[A-Z]{3}\d{2}$`)
	finalOrderType := ""
	if optionPatternRe.MatchString(productNameStr) {
		finalOrderType = "option" // This overrides stockbuy/stocksale for options
	} else {
		if orderTypeStr == "compra" {
			finalOrderType = "stockbuy"
		} else {
			finalOrderType = "stocksale"
		}
	}

	return finalOrderType, qty, p, parsedISIN, productNameStr, nil
}

// determineTransactionType is a helper to categorize based on OrderType.
func determineTransactionType(orderType string) string {
	switch strings.ToLower(orderType) {
	case "stockbuy", "stocksale":
		return "STOCK"
	case "option": // Assuming parseDescription sets "option" for options
		return "OPTION"
	case "dividend", "dividendtax":
		return "DIVIDEND"
	case "cashdeposit":
		return "CASH_MOVEMENT"
	case "fee", "commission": // If you parse these separately
		return "FEE"
	default:
		logger.L.Warn("Unknown order type for transaction type determination", "orderType", orderType)
		return "UNKNOWN"
	}
}
