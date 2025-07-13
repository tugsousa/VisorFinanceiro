package processors

import (
	"sort"
	"strconv"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

// stockProcessorImpl implements the StockProcessor interface.
type stockProcessorImpl struct{}

// NewStockProcessor creates a new instance of StockProcessor.
func NewStockProcessor() StockProcessor {
	return &stockProcessorImpl{}
}

// Process implements the StockProcessor interface by delegating to the new refined logic.
func (p *stockProcessorImpl) Process(transactions []models.ProcessedTransaction) ([]models.SaleDetail, map[string][]models.PurchaseLot) {
	stockTransactions := filterAndSortStockTransactions(transactions)
	if len(stockTransactions) == 0 {
		return []models.SaleDetail{}, make(map[string][]models.PurchaseLot)
	}
	return calculateSalesAndYearlyHoldings(stockTransactions)
}

// calculateSalesAndYearlyHoldings processes sorted stock transactions to produce sale details and a map of holdings by year.
func calculateSalesAndYearlyHoldings(transactions []models.ProcessedTransaction) ([]models.SaleDetail, map[string][]models.PurchaseLot) {
	saleDetails := []models.SaleDetail{}
	holdingsByYear := make(map[string][]models.PurchaseLot)
	openPurchasesByISIN := make(map[string][]*models.ProcessedTransaction)

	if len(transactions) == 0 {
		return saleDetails, holdingsByYear
	}

	lastProcessedYear := utils.ParseDate(transactions[0].Date).Year()

	for _, tx := range transactions {
		txDate := utils.ParseDate(tx.Date)
		currentYear := txDate.Year()

		// --- CORE LOGIC FIX ---
		// If we cross into a new year, take a snapshot of the previous year's holdings.
		if currentYear > lastProcessedYear {
			// Take snapshot for lastProcessedYear
			snapshot := collectAndCopyHoldings(openPurchasesByISIN)
			holdingsByYear[strconv.Itoa(lastProcessedYear)] = snapshot

			// Fill in any gap years with the same snapshot
			for year := lastProcessedYear + 1; year < currentYear; year++ {
				holdingsByYear[strconv.Itoa(year)] = snapshot
			}
		}

		// Process the current transaction
		if tx.OrderType == "stockbuy" {
			purchaseCopy := tx
			openPurchasesByISIN[tx.ISIN] = append(openPurchasesByISIN[tx.ISIN], &purchaseCopy)
		} else if tx.OrderType == "stocksale" {
			remainingQty := tx.Quantity
			purchaseLots := openPurchasesByISIN[tx.ISIN]

			for remainingQty > 0 && len(purchaseLots) > 0 {
				currentPurchase := purchaseLots[0]
				matchedQty := utils.MinInt(remainingQty, currentPurchase.Quantity)

				// Sale Detail calculation
				saleRatio := float64(matchedQty) / float64(tx.Quantity)
				var purchaseRatio float64
				if currentPurchase.OriginalQuantity > 0 {
					purchaseRatio = float64(matchedQty) / float64(currentPurchase.OriginalQuantity)
				}
				buyCommissionToAdd := 0.0
				if currentPurchase.Commission > 0 {
					buyCommissionToAdd = currentPurchase.Commission
					currentPurchase.Commission = 0 // Mark as used
				}
				totalDetailCommission := (tx.Commission * saleRatio) + buyCommissionToAdd
				buyAmountEUR := utils.RoundFloat(currentPurchase.AmountEUR*purchaseRatio, 2)
				saleAmountEUR := utils.RoundFloat(tx.AmountEUR*saleRatio, 2)

				saleDetails = append(saleDetails, models.SaleDetail{
					SaleDate:         tx.Date,
					BuyDate:          currentPurchase.Date,
					ProductName:      tx.ProductName,
					ISIN:             tx.ISIN,
					Quantity:         matchedQty,
					SaleAmount:       tx.Amount * saleRatio,
					SaleCurrency:     tx.Currency,
					SaleAmountEUR:    saleAmountEUR,
					SalePrice:        tx.Price,
					SaleExchangeRate: tx.ExchangeRate,
					BuyAmount:        currentPurchase.Amount * purchaseRatio,
					BuyCurrency:      currentPurchase.Currency,
					BuyAmountEUR:     buyAmountEUR,
					BuyPrice:         currentPurchase.Price,
					BuyExchangeRate:  currentPurchase.ExchangeRate,
					Commission:       utils.RoundFloat(totalDetailCommission, 2),
					Delta:            utils.RoundFloat(buyAmountEUR+saleAmountEUR, 2),
					CountryCode:      utils.GetCountryCodeString(tx.ISIN),
				})

				remainingQty -= matchedQty
				currentPurchase.Quantity -= matchedQty
				if currentPurchase.Quantity == 0 {
					purchaseLots = purchaseLots[1:]
				}
				openPurchasesByISIN[tx.ISIN] = purchaseLots
			}
		}

		// Update the last processed year marker
		lastProcessedYear = currentYear
	}

	// After the loop, take one final snapshot for the very last year of transactions
	finalSnapshot := collectAndCopyHoldings(openPurchasesByISIN)
	holdingsByYear[strconv.Itoa(lastProcessedYear)] = finalSnapshot

	return saleDetails, holdingsByYear
}

// collectAndCopyHoldings creates a deep copy of the current state of all purchase lots.
func collectAndCopyHoldings(holdingsMap map[string][]*models.ProcessedTransaction) []models.PurchaseLot {
	var snapshot []models.PurchaseLot
	for _, lots := range holdingsMap {
		for _, lot := range lots {
			if lot.Quantity > 0 {
				// Pro-rate the amount based on remaining quantity
				var lotAmount, lotAmountEUR float64
				if lot.OriginalQuantity > 0 {
					ratio := float64(lot.Quantity) / float64(lot.OriginalQuantity)
					lotAmount = lot.Amount * ratio
					lotAmountEUR = lot.AmountEUR * ratio
				}

				snapshot = append(snapshot, models.PurchaseLot{
					BuyDate:      lot.Date,
					ProductName:  lot.ProductName,
					ISIN:         lot.ISIN,
					Quantity:     lot.Quantity,
					BuyAmount:    lotAmount,
					BuyCurrency:  lot.Currency,
					BuyAmountEUR: utils.RoundFloat(lotAmountEUR, 2),
					BuyPrice:     lot.Price,
				})
			}
		}
	}
	return snapshot
}

// filterAndSortStockTransactions filters for stock-related transactions and sorts them chronologically.
func filterAndSortStockTransactions(transactions []models.ProcessedTransaction) []models.ProcessedTransaction {
	var stockTx []models.ProcessedTransaction
	for _, tx := range transactions {
		if tx.OrderType == "stockbuy" || tx.OrderType == "stocksale" {
			stockTx = append(stockTx, tx)
		}
	}
	sort.Slice(stockTx, func(i, j int) bool {
		dateI := utils.ParseDate(stockTx[i].Date)
		dateJ := utils.ParseDate(stockTx[j].Date)
		if dateI.Equal(dateJ) {
			if stockTx[i].OrderType == "stocksale" && stockTx[j].OrderType == "stockbuy" {
				return false
			}
			if stockTx[i].OrderType == "stockbuy" && stockTx[j].OrderType == "stocksale" {
				return true
			}
			return stockTx[i].OrderID < stockTx[j].OrderID
		}
		return dateI.Before(dateJ)
	})
	return stockTx
}
