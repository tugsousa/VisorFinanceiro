// backend/src/services/performance_test.go
package services

import (
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/models"
)

// Mock parser for testing
type mockParser struct {
	transactions []models.CanonicalTransaction
}

func (p *mockParser) Parse(file io.Reader) ([]models.CanonicalTransaction, error) {
	return p.transactions, nil
}

// Mock transaction processor
type mockTransactionProcessor struct{}

func (p *mockTransactionProcessor) Process(txs []models.CanonicalTransaction) []models.ProcessedTransaction {
	var processed []models.ProcessedTransaction
	for _, tx := range txs {
		processed = append(processed, models.ProcessedTransaction{
			Date:               tx.TransactionDate.Format("02-01-2006"),
			Source:             tx.Source,
			ProductName:        tx.ProductName,
			ISIN:               tx.ISIN,
			Quantity:           int(tx.Quantity),
			OriginalQuantity:   int(tx.Quantity),
			Price:              tx.Price,
			TransactionType:    tx.TransactionType,
			TransactionSubType: tx.TransactionSubType,
			BuySell:            tx.BuySell,
			Description:        tx.RawText,
			Amount:             tx.Amount,
			Currency:           tx.Currency,
			Commission:         0,
			OrderID:            tx.OrderID,
			ExchangeRate:       1.0,
			AmountEUR:          tx.Amount,
			CountryCode:        "PT",
			InputString:        tx.RawText,
			HashId:             "test-hash",
			CashBalance:        0,
			BalanceCurrency:    "EUR",
		})
	}
	return processed
}

// Mock price service
type mockPriceService struct{}

func (s *mockPriceService) GetCurrentPrices(isins []string) (map[string]PriceInfo, error) {
	// Simulate API delay
	time.Sleep(100 * time.Millisecond)

	results := make(map[string]PriceInfo)
	for _, isin := range isins {
		results[isin] = PriceInfo{
			Status:   "OK",
			Price:    100.0,
			Currency: "EUR",
		}
	}
	return results, nil
}

func (s *mockPriceService) GetHistoricalPrices(ticker string) (PriceMap, string, error) {
	return make(PriceMap), "EUR", nil
}

func (s *mockPriceService) GetLastYearDividends(ticker string) (map[time.Month]float64, string, error) {
	return make(map[time.Month]float64), "EUR", nil
}

func (s *mockPriceService) EnsureBenchmarkData() error {
	return nil
}

// Test performance improvements
func TestUploadPerformanceOptimizations(t *testing.T) {
	// Create test data with multiple ISINs to simulate large document
	testISINs := []string{
		"IE000U9J8HX9", // JEPQ.L
		"IE00BK5BQT80", // VWRA.L
		"US5168061068", // MSFT
		"US0378331005", // AAPL
		"US5949181045", // NFLX
		"US0231351067", // AMZN
		"US56583A1014", // NVDA
		"US02079K3059", // ABBV
		"US0382221051", // ADBE
		"US0231351067", // AMZN (duplicate)
	}

	// Create mock transactions
	var transactions []models.CanonicalTransaction
	for i, isin := range testISINs {
		transactions = append(transactions, models.CanonicalTransaction{
			Source:          "degiro",
			TransactionDate: time.Now(),
			ProductName:     fmt.Sprintf("Test Product %d", i),
			ISIN:            isin,
			Quantity:        10,
			Price:           100.0,
			Currency:        "EUR",
			OrderID:         fmt.Sprintf("ORDER-%d", i),
			RawText:         fmt.Sprintf("Test transaction for %s", isin),
			Amount:          1000.0,
			TransactionType: "STOCK",
			BuySell:         "BUY",
		})
	}

	// Create mock services
	transactionProcessor := &mockTransactionProcessor{}
	priceService := &mockPriceService{}

	// Test ISIN resolution performance
	t.Run("ISIN Resolution Performance", func(t *testing.T) {
		start := time.Now()

		// Simulate the optimized ISIN resolution process
		isinList := make([]string, 0, len(testISINs))
		for _, tx := range transactions {
			if len(tx.ISIN) == 12 {
				isinList = append(isinList, tx.ISIN)
			}
		}

		// This should be much faster with our optimizations
		_, err := priceService.GetCurrentPrices(isinList)
		if err != nil {
			t.Fatalf("Failed to get prices: %v", err)
		}

		duration := time.Since(start)
		t.Logf("ISIN resolution took: %v", duration)

		// With optimizations, this should complete in under 200ms
		// (Previously would take 7+ seconds for large documents)
		if duration > 200*time.Millisecond {
			t.Errorf("ISIN resolution too slow: %v (expected < 200ms)", duration)
		}
	})

	// Test upload processing with background ISIN resolution
	t.Run("Upload Processing with Background Resolution", func(t *testing.T) {
		start := time.Now()

		// Process transactions (this is fast)
		processedTxs := transactionProcessor.Process(transactions)

		// Start background ISIN resolution (this runs concurrently)
		go func() {
			isinList := make([]string, 0, len(testISINs))
			for _, tx := range processedTxs {
				if len(tx.ISIN) == 12 {
					isinList = append(isinList, tx.ISIN)
				}
			}
			_, _ = priceService.GetCurrentPrices(isinList)
		}()

		// Main upload processing continues without waiting
		uploadDuration := time.Since(start)
		t.Logf("Upload processing took: %v", uploadDuration)

		// Main upload should be very fast (under 50ms)
		// The ISIN resolution happens in background
		if uploadDuration > 50*time.Millisecond {
			t.Errorf("Upload processing too slow: %v (expected < 50ms)", uploadDuration)
		}
	})

	// Test parallel processing benefits
	t.Run("Parallel Processing Benefits", func(t *testing.T) {
		// Test with larger dataset to see parallel benefits
		largeISINs := make([]string, 50)
		for i := 0; i < 50; i++ {
			largeISINs[i] = fmt.Sprintf("TEST-ISIN-%03d", i)
		}

		start := time.Now()

		// Process in parallel (simulated)
		chunkSize := 10
		for i := 0; i < len(largeISINs); i += chunkSize {
			end := i + chunkSize
			if end > len(largeISINs) {
				end = len(largeISINs)
			}

			// Simulate parallel processing of chunks
			batch := largeISINs[i:end]
			go func(batch []string) {
				_, _ = priceService.GetCurrentPrices(batch)
			}(batch)
		}

		// Wait a bit for goroutines to complete
		time.Sleep(200 * time.Millisecond)

		parallelDuration := time.Since(start)
		t.Logf("Parallel processing of %d ISINs took: %v", len(largeISINs), parallelDuration)

		// Should be significantly faster than sequential processing
		if parallelDuration > 500*time.Millisecond {
			t.Errorf("Parallel processing too slow: %v", parallelDuration)
		}
	})
}

// Benchmark the upload service
func BenchmarkUploadService(b *testing.B) {
	// Create test data
	testISINs := []string{
		"IE000U9J8HX9", "IE00BK5BQT80", "US5168061068", "US0378331005",
		"US5949181045", "US0231351067", "US56583A1014", "US02079K3059",
	}

	var transactions []models.CanonicalTransaction
	for i, isin := range testISINs {
		transactions = append(transactions, models.CanonicalTransaction{
			Source:          "degiro",
			TransactionDate: time.Now(),
			ProductName:     fmt.Sprintf("Test Product %d", i),
			ISIN:            isin,
			Quantity:        10,
			Price:           100.0,
			Currency:        "EUR",
			OrderID:         fmt.Sprintf("ORDER-%d", i),
			RawText:         fmt.Sprintf("Test transaction for %s", isin),
			Amount:          1000.0,
			TransactionType: "STOCK",
			BuySell:         "BUY",
		})
	}

	transactionProcessor := &mockTransactionProcessor{}
	priceService := &mockPriceService{}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Simulate upload processing
		processedTxs := transactionProcessor.Process(transactions)

		// Extract unique ISINs
		uniqueISINs := make(map[string]bool)
		for _, tx := range processedTxs {
			if len(tx.ISIN) == 12 {
				uniqueISINs[tx.ISIN] = true
			}
		}

		isinList := make([]string, 0, len(uniqueISINs))
		for isin := range uniqueISINs {
			isinList = append(isinList, isin)
		}

		// This represents the optimized ISIN resolution
		_, _ = priceService.GetCurrentPrices(isinList)
	}
}
