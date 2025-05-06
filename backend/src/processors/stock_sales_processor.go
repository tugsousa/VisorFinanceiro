package processors

import (
	"sort"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils" // Import the new utils package
	// "time" // No longer needed directly if using utils.ParseDate
)

// stockProcessorImpl implements the StockProcessor interface.
type stockProcessorImpl struct{}

// NewStockProcessor creates a new instance of StockProcessor.
func NewStockProcessor() StockProcessor { // Return the interface type
	return &stockProcessorImpl{} // Return the implementation struct
}

// Process implements the StockProcessor interface.
func (p *stockProcessorImpl) Process(transactions []models.ProcessedTransaction) ([]models.SaleDetail, []models.PurchaseLot) {
	// Group transactions by ISIN
	transactionsByISIN := groupTransactionsByISIN(transactions)

	var stockSaleDetails []models.SaleDetail // Renamed from saleDetails
	var stockHoldings []models.PurchaseLot   // Renamed from remainingPurchases

	for isin, txs := range transactionsByISIN {
		purchases, sales := separatePurchaseAndSales(txs)
		sortPurchasesByDate(purchases)
		sortSalesByDate(sales)

		// Convert purchases to pointers for in-place modification
		purchasePtrs := make([]*models.ProcessedTransaction, len(purchases))
		for i := range purchases {
			purchasePtrs[i] = &purchases[i]
		}

		for _, sale := range sales {
			remainingQty := sale.Quantity
			// totalCommission := sale.Commission // Removed unused variable

			for remainingQty > 0 && len(purchasePtrs) > 0 {
				currentPurchase := purchasePtrs[0]
				matchedQty := utils.MinInt(remainingQty, currentPurchase.Quantity) // Use utils.MinInt

				// Calculate prorated amounts
				saleRatio := float64(matchedQty) / float64(sale.Quantity)
				// Corrected: Use OriginalQuantity for accurate proration of the initial cost
				// Add a check for zero OriginalQuantity to prevent division by zero, although unlikely for purchases.
				var purchaseRatio float64
				if currentPurchase.OriginalQuantity > 0 {
					purchaseRatio = float64(matchedQty) / float64(currentPurchase.OriginalQuantity)
				} else {
					// Handle potential edge case or error, though OriginalQuantity should be > 0 for a purchase
					purchaseRatio = 0 // Or log an error
				}

				// Calculate unit prices (use original prices, not prorated amounts)
				salePrice := sale.Price
				buyPrice := currentPurchase.Price

				// Calculate prorated SALE commission
				proratedSaleCommission := sale.Commission * saleRatio // Use sale.Commission directly

				// Determine buy commission to add (only for the first sale touching this purchase)
				buyCommissionToAdd := 0.0
				if currentPurchase.Commission > 0 {
					buyCommissionToAdd = currentPurchase.Commission
					currentPurchase.Commission = 0 // Mark purchase commission as used for subsequent matches
				}

				// Calculate total commission for this sale detail
				totalDetailCommission := proratedSaleCommission + buyCommissionToAdd

				// Calculate EUR amounts before creating the struct
				buyAmountEUR := utils.RoundFloat(currentPurchase.AmountEUR*purchaseRatio, 2)
				saleAmountEUR := utils.RoundFloat(sale.AmountEUR*saleRatio, 2)

				saleDetail := models.SaleDetail{
					SaleDate:         sale.Date,
					BuyDate:          currentPurchase.Date,
					ProductName:      sale.ProductName,
					ISIN:             isin,
					Quantity:         matchedQty,
					SaleAmount:       sale.Amount * saleRatio, // Keep original precision unless specified
					SaleCurrency:     sale.Currency,
					SaleAmountEUR:    saleAmountEUR, // Use pre-calculated value
					SalePrice:        salePrice,
					SaleExchangeRate: sale.ExchangeRate,                      // Add sale exchange rate
					BuyAmount:        currentPurchase.Amount * purchaseRatio, // Keep original precision unless specified
					BuyCurrency:      currentPurchase.Currency,
					BuyAmountEUR:     buyAmountEUR,                                    // Use pre-calculated value
					BuyPrice:         buyPrice,                                        // Use the original unit price
					BuyExchangeRate:  currentPurchase.ExchangeRate,                    // Add buy exchange rate
					Commission:       utils.RoundFloat(totalDetailCommission, 2),      // Use the combined commission
					Delta:            utils.RoundFloat(buyAmountEUR+saleAmountEUR, 2), // Use pre-calculated values
					CountryCode:      utils.GetCountryCodeString(isin),                // Add country code using the utility function
				}
				stockSaleDetails = append(stockSaleDetails, saleDetail) // Appending to renamed variable

				// Update quantities
				remainingQty -= matchedQty
				currentPurchase.Quantity -= matchedQty

				// Remove exhausted purchases
				if currentPurchase.Quantity == 0 {
					purchasePtrs = purchasePtrs[1:]
				}
			}
		}

		// Record remaining stock holdings
		for _, p := range purchasePtrs {
			if p.Quantity > 0 {
				stockHoldings = append(stockHoldings, models.PurchaseLot{ // Appending to renamed variable
					BuyDate:      p.Date,
					ProductName:  p.ProductName,
					ISIN:         isin,
					Quantity:     p.Quantity,
					BuyAmount:    p.Amount, // Keep original precision unless specified
					BuyCurrency:  p.Currency,
					BuyAmountEUR: utils.RoundFloat(p.AmountEUR, 2), // Round to 2 decimal places
					BuyPrice:     p.Price,                          // Use the original price
				})
			}
		}
	}

	return stockSaleDetails, stockHoldings // Returning renamed variables
}

// Helper functions remain the same as before
func groupTransactionsByISIN(transactions []models.ProcessedTransaction) map[string][]models.ProcessedTransaction {
	grouped := make(map[string][]models.ProcessedTransaction)
	for _, tx := range transactions {
		if tx.ISIN == "" {
			continue
		}
		grouped[tx.ISIN] = append(grouped[tx.ISIN], tx)
	}
	return grouped
}

func separatePurchaseAndSales(transactions []models.ProcessedTransaction) (purchases, sales []models.ProcessedTransaction) {
	for _, tx := range transactions {
		switch tx.OrderType {
		case "stockbuy":
			purchases = append(purchases, tx)
		case "stocksale":
			sales = append(sales, tx)
		}
	}
	return
}

func sortPurchasesByDate(purchases []models.ProcessedTransaction) {
	sort.Slice(purchases, func(i, j int) bool {
		return utils.ParseDate(purchases[i].Date).Before(utils.ParseDate(purchases[j].Date)) // Use utils.ParseDate
	})
}

func sortSalesByDate(sales []models.ProcessedTransaction) {
	sort.Slice(sales, func(i, j int) bool {
		return utils.ParseDate(sales[i].Date).Before(utils.ParseDate(sales[j].Date)) // Use utils.ParseDate
	})
}

// Removed local helper functions (minInt, parseDate) as they are now in the utils package
