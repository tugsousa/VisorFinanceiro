package processors

import (
	"TAXFOLIO/src/models"
	"sort"
	"time"
)

type StockProcessor struct{}

func NewStockProcessor() *StockProcessor {
	return &StockProcessor{}
}

func (p *StockProcessor) ProcessTransactions(transactions []models.ProcessedTransaction) ([]models.SaleDetail, []models.PurchaseLot) {
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
			totalCommission := sale.Commission

			for remainingQty > 0 && len(purchasePtrs) > 0 {
				currentPurchase := purchasePtrs[0]
				matchedQty := min(remainingQty, currentPurchase.Quantity)

				// Calculate prorated amounts
				saleRatio := float64(matchedQty) / float64(sale.Quantity)
				purchaseRatio := float64(matchedQty) / float64(currentPurchase.Quantity)

				// Calculate unit prices (use original prices, not prorated amounts)
				salePrice := sale.Price
				buyPrice := currentPurchase.Price

				// Calculate prorated commission
				commission := totalCommission * saleRatio

				saleDetail := models.SaleDetail{
					SaleDate:      sale.Date,
					BuyDate:       currentPurchase.Date,
					ProductName:   sale.ProductName,
					ISIN:          isin,
					Quantity:      matchedQty,
					SaleAmount:    sale.Amount * saleRatio,
					SaleCurrency:  sale.Currency,
					SaleAmountEUR: sale.AmountEUR * saleRatio,
					SalePrice:     salePrice,
					BuyAmount:     currentPurchase.Amount * purchaseRatio,
					BuyCurrency:   currentPurchase.Currency,
					BuyAmountEUR:  currentPurchase.AmountEUR * purchaseRatio,
					BuyPrice:      buyPrice, // Use the original unit price
					Commission:    commission,
					Delta:         (salePrice - buyPrice) * float64(matchedQty),
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
					BuyAmount:    p.Amount,
					BuyCurrency:  p.Currency,
					BuyAmountEUR: p.AmountEUR,
					BuyPrice:     p.Price, // Use the original price
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
		return parseDate(purchases[i].Date).Before(parseDate(purchases[j].Date))
	})
}

func sortSalesByDate(sales []models.ProcessedTransaction) {
	sort.Slice(sales, func(i, j int) bool {
		return parseDate(sales[i].Date).Before(parseDate(sales[j].Date))
	})
}

func parseDate(dateStr string) time.Time {
	t, _ := time.Parse("02-01-2006", dateStr) // Adjust format if needed
	return t
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
