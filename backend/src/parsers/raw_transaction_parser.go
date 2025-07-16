// backend/src/parsers/raw_transaction_parser.go
package parsers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security/validation"
	"github.com/username/taxfolio/backend/src/utils"
)

type transactionProcessorImpl struct{}

func NewTransactionProcessor() TransactionProcessor {
	return &transactionProcessorImpl{}
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

		mainType, subType, buySell, parsedName, quantity, price, err := parseDescription(sanitizedRaw.Description)
		if err != nil {
			logger.L.Warn("Skipping transaction due to parseDescription error", "originalOrderID", sanitizedRaw.OrderID, "description", sanitizedRaw.Description, "error", err)
			continue
		}

		if mainType == "PRODUCT_CHANGE" {
			logger.L.Info("Skipping administrative 'Product Change' transaction", "originalOrderID", sanitizedRaw.OrderID)
			continue
		}

		var amount float64
		if sanitizedRaw.Amount != "" {
			amount, err = strconv.ParseFloat(sanitizedRaw.Amount, 64)
			if err != nil {
				logger.L.Error("Internal error: Failed to parse pre-validated amount string", "originalOrderID", sanitizedRaw.OrderID, "amountStr", sanitizedRaw.Amount, "error", err)
				return nil, fmt.Errorf("internal error parsing amount for OrderID %s: %w", sanitizedRaw.OrderID, err)
			}
		}

		transactionDate, dateParseErr := time.Parse("02-01-2006", sanitizedRaw.OrderDate)
		if dateParseErr != nil {
			logger.L.Error("Internal error: Failed to parse pre-validated OrderDate", "dateStr", sanitizedRaw.OrderDate, "error", dateParseErr)
			return nil, fmt.Errorf("internal error parsing pre-validated OrderDate %s", sanitizedRaw.OrderDate)
		}

		exchangeRateValue := 1.0
		if sanitizedRaw.Currency != "EUR" {
			rate, err := processors.GetExchangeRate(sanitizedRaw.Currency, transactionDate)
			if err != nil || rate <= 0 {
				logger.L.Warn("Unable to retrieve valid exchange rate, defaulting to 1.0", "currency", sanitizedRaw.Currency, "date", sanitizedRaw.OrderDate, "originalOrderID", sanitizedRaw.OrderID, "error", err)
			} else {
				exchangeRateValue = rate
			}
		}

		amountEUR := amount
		if sanitizedRaw.Currency != "EUR" {
			amountEUR = amount / exchangeRateValue
		}

		productNameForProcessedTx := parsedName
		if mainType == "DIVIDEND" && sanitizedRaw.Name != "" {
			productNameForProcessedTx = sanitizedRaw.Name
		}

		inputString := fmt.Sprintf("%s|%s|%s", sanitizedRaw.OrderDate, sanitizedRaw.Description, sanitizedRaw.Amount)
		hash := sha256.Sum256([]byte(inputString))

		processed := models.ProcessedTransaction{
			Date:               sanitizedRaw.OrderDate,
			Source:             "DEGIRO", // Hardcoded for now
			ProductName:        productNameForProcessedTx,
			ISIN:               sanitizedRaw.ISIN,
			Quantity:           quantity,
			OriginalQuantity:   quantity,
			Price:              price,
			TransactionType:    mainType,
			TransactionSubType: subType,
			BuySell:            buySell,
			Description:        sanitizedRaw.Description,
			Amount:             amount,
			Currency:           sanitizedRaw.Currency,
			Commission:         0.0, // Commission logic can be added later
			OrderID:            sanitizedRaw.OrderID,
			ExchangeRate:       exchangeRateValue,
			AmountEUR:          amountEUR,
			CountryCode:        utils.GetCountryCodeString(sanitizedRaw.ISIN),
			InputString:        inputString,
			HashId:             hex.EncodeToString(hash[:]),
		}
		processedTransactions = append(processedTransactions, processed)

		if (i+1)%100 == 0 || i == len(rawTransactions)-1 {
			logger.L.Debug("Processed batch of raw transactions", "currentIndex", i+1, "total", len(rawTransactions), "lastOrderID", sanitizedRaw.OrderID, "batchLoopDuration", time.Since(loopStartTime))
		}
	}
	logger.L.Info("transactionProcessor.Process END", "processedCount", len(processedTransactions), "totalDuration", time.Since(overallStartTime))
	return processedTransactions, nil
}

func parseDescription(description string) (mainType, subType, buySell, productName string, quantity int, price float64, err error) {
	desc := strings.TrimSpace(strings.ReplaceAll(description, "\u00A0", " "))

	if strings.Contains(strings.ToLower(desc), "mudança de produto") {
		return "PRODUCT_CHANGE", "", "", "Product Change Event", 0, 0, nil
	}
	if strings.EqualFold(desc, "Depósito") || strings.EqualFold(desc, "flatex Deposit") {
		return "CASH", "DEPOSIT", "", "Cash Deposit", 0, 0, nil
	}
	if strings.Contains(strings.ToLower(desc), "degiro cash sweep transfer") {
		return "CASH", "SWEEP", "", "Cash Sweep Transfer", 0, 0, nil
	}

	dividendRe := regexp.MustCompile(`(?i)^(Dividendo|Imposto sobre Dividendo)\s+(.+?)(?:\s+\(.+\))?$`)
	if dividendMatches := dividendRe.FindStringSubmatch(desc); dividendMatches != nil {
		productName := strings.TrimSpace(dividendMatches[2])
		if strings.HasPrefix(strings.ToLower(desc), "imposto sobre dividendo") {
			return "DIVIDEND", "TAX", "", productName, 0, 0, nil
		}
		return "DIVIDEND", "", "", productName, 0, 0, nil
	}

	if strings.EqualFold(desc, "Dividendo") {
		return "DIVIDEND", "", "", "N/A", 0, 0, nil
	}
	if strings.EqualFold(desc, "Imposto sobre Dividendo") {
		return "DIVIDEND", "TAX", "", "N/A", 0, 0, nil
	}

	stockOrOptionRe := regexp.MustCompile(`(?i)\s*(compra|venda)\s+([\d\s]+)\s+([a-zA-Z0-9\s\.\-\(\)]+\s+[CP]\d+(?:\.\d+)?\s+\d{2}[A-Z]{3}\d{2}|[a-zA-Z0-9\s\.\-\(\)]+)\s*@([\d,]+)`)
	matches := stockOrOptionRe.FindStringSubmatch(desc)
	if matches == nil {
		if strings.Contains(strings.ToLower(desc), "comissões de transação") || strings.Contains(strings.ToLower(desc), "custo de conectividade") {
			return "FEE", "", "", "Brokerage Fee", 0, 0, nil
		}
		return "", "", "", "", 0, 0, fmt.Errorf("unknown transaction format: '%s'", description)
	}

	buySellRaw := strings.ToLower(matches[1])
	var buySellStr string
	if buySellRaw == "compra" {
		buySellStr = "BUY"
	} else if buySellRaw == "venda" {
		buySellStr = "SELL"
	}

	quantityStr := strings.ReplaceAll(matches[2], " ", "")
	productNameStr := strings.TrimSpace(matches[3])
	priceStr := strings.ReplaceAll(matches[4], ",", ".")

	qty, qErr := strconv.Atoi(quantityStr)
	if qErr != nil {
		return "", "", "", "", 0, 0, fmt.Errorf("invalid quantity '%s' in description: %w", quantityStr, qErr)
	}

	p, pErr := strconv.ParseFloat(priceStr, 64)
	if pErr != nil {
		return "", "", "", "", 0, 0, fmt.Errorf("invalid price '%s' in description: %w", priceStr, pErr)
	}

	optionPatternRe := regexp.MustCompile(`\s+[CP]\d+(\.\d+)?\s+\d{2}[A-Z]{3}\d{2}$`)
	if optionPatternRe.MatchString(productNameStr) {
		var optionSubType string
		if strings.Contains(productNameStr, " C") {
			optionSubType = "CALL"
		} else if strings.Contains(productNameStr, " P") {
			optionSubType = "PUT"
		}
		return "OPTION", optionSubType, buySellStr, productNameStr, qty, p, nil
	}

	return "STOCK", "", buySellStr, productNameStr, qty, p, nil
}

func validateAndSanitizeRawTransaction(raw models.RawTransaction) (models.RawTransaction, error) {
	var sanitizedRaw = raw
	var err error
	contextID := fmt.Sprintf("RawOrderID: '%s', RawName: '%s', RawDesc: '%s'", raw.OrderID, raw.Name, raw.Description)

	sanitizedRaw.Name = validation.StripUnprintable(strings.TrimSpace(raw.Name))
	if sanitizedRaw.Name != "" {
		if err = validation.ValidateStringMaxLength(sanitizedRaw.Name, validation.MaxProductNameLength, "Name/Descritivo"); err != nil {
			return models.RawTransaction{}, fmt.Errorf("name/descritivo for %s: %w", contextID, err)
		}
	}

	sanitizedRaw.Description = validation.StripUnprintable(strings.TrimSpace(raw.Description))
	if err = validation.ValidateStringNotEmpty(sanitizedRaw.Description, "Transaction Type/Description"); err != nil {
		return models.RawTransaction{}, fmt.Errorf("transaction type/description for %s: %w", contextID, err)
	}
	if err = validation.ValidateStringMaxLength(sanitizedRaw.Description, validation.MaxDescriptionLength, "Transaction Type/Description"); err != nil {
		return models.RawTransaction{}, fmt.Errorf("transaction type for %s: %w", contextID, err)
	}

	return sanitizedRaw, nil
}
