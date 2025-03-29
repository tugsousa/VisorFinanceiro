package processors

import (
	"TAXFOLIO/src/models"
	"TAXFOLIO/src/utils" // Import the new utils package
	"log"
	"sort"
	"strings" // Ensure strings package is imported
	// "time" // No longer needed directly if using utils.ParseDate
)

// OptionProcessor handles the processing of option transactions.
type OptionProcessor struct{}

// NewOptionProcessor creates a new OptionProcessor.
func NewOptionProcessor() *OptionProcessor {
	return &OptionProcessor{}
}

// ProcessTransactions processes a list of transactions to identify and match option trades.
// It returns details of closed option trades and currently open option holdings.
func (p *OptionProcessor) ProcessTransactions(transactions []models.ProcessedTransaction) ([]models.OptionSaleDetail, []models.OptionHolding) {
	optionTransactions := filterOptionTransactions(transactions)
	transactionsByProduct := groupTransactionsByProduct(optionTransactions)

	var allOptionSaleDetails []models.OptionSaleDetail
	var allOptionHoldings []models.OptionHolding

	// Iterate over the grouped transactions; productName key is not needed in the loop body
	for _, txs := range transactionsByProduct {
		sortTransactionsByDate(txs)

		// Process trades for this specific option product
		// We need to track both long (bought) and short (sold) open positions separately
		var openLongPositions []*models.ProcessedTransaction
		var openShortPositions []*models.ProcessedTransaction
		var closedDetails []models.OptionSaleDetail

		for i := range txs {
			currentTx := &txs[i]
			// Determine buy/sell based on Description field
			isBuy := strings.Contains(strings.ToLower(currentTx.Description), "compra")
			isSell := strings.Contains(strings.ToLower(currentTx.Description), "venda")

			// Add a check for ambiguity or missing keyword
			if isBuy == isSell { // Either both true (unlikely) or both false
				log.Printf("Warning: Ambiguous or missing buy/sell keyword ('Compra'/'Venda') in option description for OrderID %s: '%s'. Skipping transaction.", currentTx.OrderID, currentTx.Description)
				continue // Skip this transaction
			}

			qty := currentTx.Quantity

			if isBuy { // Buy transaction (determined by Description)
				// Try to close open short positions first (FIFO)
				remainingBuyQty := qty
				for remainingBuyQty > 0 && len(openShortPositions) > 0 {
					shortPos := openShortPositions[0]
					matchQty := utils.MinInt(remainingBuyQty, shortPos.Quantity) // Use utils.MinInt

					// Create Sale Detail (Closing a short position - Buy closes Short)
					saleDetail := createOptionSaleDetail(shortPos, currentTx, matchQty, false) // isLongPosition = false
					closedDetails = append(closedDetails, saleDetail)

					// Update quantities
					remainingBuyQty -= matchQty
					shortPos.Quantity -= matchQty

					// Remove exhausted short position
					if shortPos.Quantity == 0 {
						openShortPositions = openShortPositions[1:]
					}
				}
				// If buy quantity remains, open a new long position
				if remainingBuyQty > 0 {
					// Create a copy for the holding to avoid modifying original slice data side effects
					holdingCopy := *currentTx
					holdingCopy.Quantity = remainingBuyQty
					openLongPositions = append(openLongPositions, &holdingCopy)
				}
			} else { // Sell transaction (could be opening a short or closing a long)
				// Try to close open long positions first (FIFO)
				remainingSellQty := qty
				for remainingSellQty > 0 && len(openLongPositions) > 0 {
					longPos := openLongPositions[0]
					matchQty := utils.MinInt(remainingSellQty, longPos.Quantity) // Use utils.MinInt

					// Create Sale Detail (Closing a long position - Sell closes Long)
					saleDetail := createOptionSaleDetail(longPos, currentTx, matchQty, true) // isLongPosition = true
					closedDetails = append(closedDetails, saleDetail)

					// Update quantities
					remainingSellQty -= matchQty
					longPos.Quantity -= matchQty

					// Remove exhausted long position
					if longPos.Quantity == 0 {
						openLongPositions = openLongPositions[1:]
					}
				}
				// If sell quantity remains, open a new short position
				if remainingSellQty > 0 {
					// Create a copy for the holding
					holdingCopy := *currentTx
					holdingCopy.Quantity = remainingSellQty // Keep quantity positive for matching logic, sign indicates type
					openShortPositions = append(openShortPositions, &holdingCopy)
				}
			}
		}

		// Add closed details for this product to the overall list
		allOptionSaleDetails = append(allOptionSaleDetails, closedDetails...)

		// Convert remaining open positions to OptionHolding structs
		for _, pos := range openLongPositions {
			allOptionHoldings = append(allOptionHoldings, createOptionHolding(pos, pos.Quantity)) // Positive quantity for long
		}
		for _, pos := range openShortPositions {
			allOptionHoldings = append(allOptionHoldings, createOptionHolding(pos, -pos.Quantity)) // Negative quantity for short
		}
	}

	return allOptionSaleDetails, allOptionHoldings
}

// --- Helper Functions ---

func filterOptionTransactions(transactions []models.ProcessedTransaction) []models.ProcessedTransaction {
	var options []models.ProcessedTransaction
	for _, tx := range transactions {
		if tx.OrderType == "option" {
			// Ensure quantity is positive for easier matching logic later
			// The sign of the amount will determine buy/sell direction
			if tx.Quantity < 0 {
				log.Printf("Warning: Option transaction %s has negative quantity %d. Taking absolute value.", tx.OrderID, tx.Quantity)
				tx.Quantity = -tx.Quantity
			}
			if tx.Quantity == 0 {
				log.Printf("Warning: Option transaction %s has zero quantity. Skipping.", tx.OrderID)
				continue
			}
			options = append(options, tx)
		}
	}
	return options
}

func groupTransactionsByProduct(transactions []models.ProcessedTransaction) map[string][]models.ProcessedTransaction {
	grouped := make(map[string][]models.ProcessedTransaction)
	for _, tx := range transactions {
		// Group by ProductName for options, as ISIN might not be reliable/present
		if tx.ProductName == "" {
			log.Printf("Warning: Skipping option transaction with empty ProductName (OrderID: %s)", tx.OrderID)
			continue
		}
		grouped[tx.ProductName] = append(grouped[tx.ProductName], tx)
	}
	return grouped
}

func sortTransactionsByDate(transactions []models.ProcessedTransaction) {
	sort.Slice(transactions, func(i, j int) bool {
		// Add secondary sort by OrderID if dates are the same, for deterministic behavior
		dateI := utils.ParseDate(transactions[i].Date) // Use utils.ParseDate
		dateJ := utils.ParseDate(transactions[j].Date) // Use utils.ParseDate
		if dateI.Equal(dateJ) {
			return transactions[i].OrderID < transactions[j].OrderID
		}
		return dateI.Before(dateJ)
	})
} // Added missing closing brace for sortTransactionsByDate

// Creates an OptionSaleDetail from opening and closing transactions.
// isLongPosition indicates if the openTx represented buying to open (long).
func createOptionSaleDetail(openTx, closeTx *models.ProcessedTransaction, quantity int, isLongPosition bool) models.OptionSaleDetail {
	var delta float64
	// Ensure quantities are not zero before division
	openQty := openTx.Quantity
	if openQty == 0 {
		openQty = 1
	} // Avoid division by zero
	closeQty := closeTx.Quantity
	if closeQty == 0 {
		closeQty = 1
	} // Avoid division by zero

	// Calculate amounts per unit for the matched quantity
	openAmountPerUnit := 0.0
	if openQty != 0 {
		openAmountPerUnit = openTx.Amount / float64(openQty)
	}
	closeAmountPerUnit := 0.0
	if closeQty != 0 {
		closeAmountPerUnit = closeTx.Amount / float64(closeQty)
	}

	// Calculate EUR amounts per unit for the matched quantity
	openAmountEURPerUnit := 0.0
	if openQty != 0 && openTx.ExchangeRate != 0 {
		openAmountEURPerUnit = (openTx.Amount / float64(openQty)) / openTx.ExchangeRate
	} else if openQty != 0 { // Handle zero exchange rate case
		openAmountEURPerUnit = openAmountPerUnit // Assume 1:1 if rate is missing/zero
	}

	closeAmountEURPerUnit := 0.0
	if closeQty != 0 && closeTx.ExchangeRate != 0 {
		closeAmountEURPerUnit = (closeTx.Amount / float64(closeQty)) / closeTx.ExchangeRate
	} else if closeQty != 0 { // Handle zero exchange rate case
		closeAmountEURPerUnit = closeAmountPerUnit // Assume 1:1 if rate is missing/zero
	}

	// Calculate total amounts for the matched quantity
	openAmountMatched := openAmountPerUnit * float64(quantity)
	closeAmountMatched := closeAmountPerUnit * float64(quantity)
	openAmountEURMatched := openAmountEURPerUnit * float64(quantity)
	closeAmountEURMatched := closeAmountEURPerUnit * float64(quantity)

	// Commission allocation (simple prorata based on quantity matched)
	openCommissionPerUnit := 0.0
	if openQty != 0 {
		openCommissionPerUnit = openTx.Commission / float64(openQty)
	}
	closeCommissionPerUnit := 0.0
	if closeQty != 0 {
		closeCommissionPerUnit = closeTx.Commission / float64(closeQty)
	}
	totalCommissionMatched := (openCommissionPerUnit + closeCommissionPerUnit) * float64(quantity)

	// Calculate Delta: Net change = Close Amount + Open Amount (before commission)
	// Note: Amounts already have correct signs (+credit/buy, -debit/sell) based on transaction type
	delta = openAmountEURMatched + closeAmountEURMatched

	return models.OptionSaleDetail{
		OpenDate:       openTx.Date,
		CloseDate:      closeTx.Date,
		ProductName:    openTx.ProductName, // Should be the same
		Quantity:       quantity,
		OpenPrice:      openTx.Price,
		OpenAmount:     openAmountMatched, // Matched portion
		OpenCurrency:   openTx.Currency,
		OpenAmountEUR:  openAmountEURMatched, // Matched portion
		ClosePrice:     closeTx.Price,
		CloseAmount:    closeAmountMatched, // Matched portion
		CloseCurrency:  closeTx.Currency,
		CloseAmountEUR: closeAmountEURMatched,  // Matched portion
		Commission:     totalCommissionMatched, // Matched portion
		Delta:          delta,
		OpenOrderID:    openTx.OrderID,
		CloseOrderID:   closeTx.OrderID,
	}
}

// Creates an OptionHolding from an open transaction.
func createOptionHolding(tx *models.ProcessedTransaction, quantity int) models.OptionHolding {
	// Ensure the holding reflects the remaining quantity if partially closed
	originalQty := tx.Quantity
	if originalQty == 0 {
		originalQty = 1
	} // Avoid division by zero if something went wrong

	return models.OptionHolding{
		OpenDate:      tx.Date,
		ProductName:   tx.ProductName,
		Quantity:      quantity, // Signed quantity (+long, -short)
		OpenPrice:     tx.Price,
		OpenAmount:    (tx.Amount / float64(originalQty)) * float64(utils.AbsInt(quantity)), // Use utils.AbsInt
		OpenCurrency:  tx.Currency,
		OpenAmountEUR: (tx.AmountEUR / float64(originalQty)) * float64(utils.AbsInt(quantity)), // Use utils.AbsInt
		OpenOrderID:   tx.OrderID,
	}
}

// Removed local helper functions (minInt, abs, parseOptionDate) as they are now in the utils package
