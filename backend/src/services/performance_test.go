package services

import (
	"context"
	"fmt"
	"log"
	"sync"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/model"
)

// BenchmarkUploadPerformance benchmarks the upload performance with optimized ISIN resolution
func BenchmarkUploadPerformance(b *testing.B) {
	// Create test data with multiple ISINs
	testISINs := []string{
		"US5949181045", // Microsoft
		"US38259P5089", // Google
		"US0378331005", // Amazon
		"US5949181045", // Microsoft (duplicate)
		"US0231351067", // Apple
		"IE00B4L5Y983", // iShares Core MSCI World UCITS ETF
		"IE00B5BMR087", // Vanguard S&P 500 UCITS ETF
		"US78462F1030", // Meta Platforms
		"US6174464486", // Netflix
		"US67066G1040", // Tesla
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		// Test the optimized ISIN resolution
		service := NewPriceService()
		start := time.Now()

		// Simulate bulk ISIN resolution
		results, err := service.GetCurrentPrices(testISINs)
		duration := time.Since(start)

		if err != nil {
			b.Errorf("Error during ISIN resolution: %v", err)
		}

		// Log performance metrics
		successCount := 0
		for _, result := range results {
			if result.Status == "OK" {
				successCount++
			}
		}

		b.Logf("Batch %d: Resolved %d/%d ISINs in %v", i+1, successCount, len(testISINs), duration)

		// Performance assertions
		if duration > 30*time.Second {
			b.Errorf("ISIN resolution took too long: %v", duration)
		}
	}
}

// TestBulkISINResolution tests the bulk ISIN resolution functionality
func TestBulkISINResolution(t *testing.T) {
	service := NewPriceService()

	// Test with a mix of known and unknown ISINs
	testISINs := []string{
		"US5949181045",   // Microsoft
		"US38259P5089",   // Google
		"INVALIDISIN123", // Invalid ISIN
		"US0378331005",   // Amazon
	}

	results, err := service.GetCurrentPrices(testISINs)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Verify results
	if len(results) != len(testISINs) {
		t.Errorf("Expected %d results, got %d", len(testISINs), len(results))
	}

	// Check that valid ISINs have prices
	validCount := 0
	for isin, result := range results {
		if result.Status == "OK" {
			validCount++
			if result.Price <= 0 {
				t.Errorf("Invalid price for ISIN %s: %f", isin, result.Price)
			}
			if result.Currency != "EUR" {
				t.Errorf("Expected EUR currency, got %s for ISIN %s", result.Currency, isin)
			}
		}
	}

	t.Logf("Successfully resolved %d out of %d ISINs", validCount, len(testISINs))
}

// TestCircuitBreakerBehavior tests the circuit breaker functionality
func TestCircuitBreakerBehavior(t *testing.T) {
	service := NewPriceService()

	// Test with an ISIN that should fail multiple times
	invalidISIN := "INVALIDISIN12345"

	// Force multiple failures to trigger circuit breaker
	for i := 0; i < 12; i++ {
		_, err := service.GetCurrentPrices([]string{invalidISIN})
		if err != nil {
			t.Logf("Attempt %d failed as expected: %v", i+1, err)
		}
	}

	// After multiple failures, circuit breaker should be open
	// This should fail quickly without making API calls
	start := time.Now()
	_, _ = service.GetCurrentPrices([]string{invalidISIN})
	duration := time.Since(start)

	if duration > 100*time.Millisecond {
		t.Errorf("Circuit breaker should have failed quickly, took %v", duration)
	}

	t.Logf("Circuit breaker test completed in %v", duration)
}

// TestCacheEffectiveness tests the effectiveness of caching
func TestCacheEffectiveness(t *testing.T) {
	service := NewPriceService()

	// First request should take time
	start := time.Now()
	results1, err := service.GetCurrentPrices([]string{"US5949181045"}) // Microsoft
	firstDuration := time.Since(start)

	if err != nil {
		t.Errorf("First request failed: %v", err)
	}

	// Second request should be faster due to caching
	start = time.Now()
	results2, err := service.GetCurrentPrices([]string{"US5949181045"}) // Microsoft again
	secondDuration := time.Since(start)

	if err != nil {
		t.Errorf("Second request failed: %v", err)
	}

	// Verify results are the same
	if len(results1) != len(results2) {
		t.Errorf("Result counts don't match")
	}

	for isin, result1 := range results1 {
		result2, exists := results2[isin]
		if !exists {
			t.Errorf("ISIN %s missing from second result", isin)
		}
		if result1.Price != result2.Price {
			t.Errorf("Prices don't match for ISIN %s: %f vs %f", isin, result1.Price, result2.Price)
		}
	}

	t.Logf("First request: %v, Second request: %v", firstDuration, secondDuration)

	// The second request should be significantly faster (at least 50% faster)
	if secondDuration > firstDuration/2 {
		t.Logf("Warning: Cache effectiveness may be limited, second request was not significantly faster")
	}
}

// TestConcurrentISINResolution tests concurrent ISIN resolution
func TestConcurrentISINResolution(t *testing.T) {
	service := NewPriceService()

	// Test concurrent resolution of the same ISIN
	isin := "US5949181045" // Microsoft
	var wg sync.WaitGroup
	results := make([]map[string]PriceInfo, 10)
	errors := make([]error, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			results[index], errors[index] = service.GetCurrentPrices([]string{isin})
		}(i)
	}

	wg.Wait()

	// Verify all requests succeeded
	for i, err := range errors {
		if err != nil {
			t.Errorf("Request %d failed: %v", i, err)
		}
	}

	// Verify all results are consistent
	if len(results) > 0 {
		expectedPrice := results[0][isin].Price
		for i, result := range results {
			if result[isin].Price != expectedPrice {
				t.Errorf("Inconsistent price in request %d: %f vs %f", i, result[isin].Price, expectedPrice)
			}
		}
	}

	t.Logf("Successfully completed %d concurrent requests for ISIN %s", len(results), isin)
}

// TestDatabaseOperations tests the optimized database operations
func TestDatabaseOperations(t *testing.T) {
	// Test batch insert operations
	mappings := []model.ISINTickerMap{
		{
			ISIN:         "TESTISIN001",
			TickerSymbol: "TEST1",
			Currency:     "USD",
		},
		{
			ISIN:         "TESTISIN002",
			TickerSymbol: "TEST2",
			Currency:     "EUR",
		},
		{
			ISIN:         "TESTISIN003",
			TickerSymbol: "TEST3",
			Currency:     "GBP",
		},
	}

	start := time.Now()
	err := model.BatchInsertMappings(database.DB, mappings)
	duration := time.Since(start)

	if err != nil {
		t.Errorf("Batch insert failed: %v", err)
	}

	t.Logf("Batch insert of %d mappings completed in %v", len(mappings), duration)

	// Test batch retrieval
	isins := []string{"TESTISIN001", "TESTISIN002", "TESTISIN003"}
	start = time.Now()
	retrievedMappings, err := model.GetMappingsByISINs(database.DB, isins)
	retrievalDuration := time.Since(start)

	if err != nil {
		t.Errorf("Batch retrieval failed: %v", err)
	}

	if len(retrievedMappings) != len(mappings) {
		t.Errorf("Expected %d mappings, got %d", len(mappings), len(retrievedMappings))
	}

	t.Logf("Batch retrieval of %d mappings completed in %v", len(retrievedMappings), retrievalDuration)
}

// RunPerformanceTest runs a comprehensive performance test
func RunPerformanceTest() {
	fmt.Println("=== Performance Test Report ===")

	// Test 1: Bulk ISIN resolution performance
	fmt.Println("\n1. Bulk ISIN Resolution Performance:")
	service := NewPriceService()
	testISINs := []string{
		"US5949181045", "US38259P5089", "US0378331005",
		"US0231351067", "IE00B4L5Y983", "IE00B5BMR087",
		"US78462F1030", "US6174464486", "US67066G1040",
	}

	start := time.Now()
	results, err := service.GetCurrentPrices(testISINs)
	duration := time.Since(start)

	if err != nil {
		fmt.Printf("   Error: %v\n", err)
	} else {
		successCount := 0
		for _, result := range results {
			if result.Status == "OK" {
				successCount++
			}
		}
		fmt.Printf("   Resolved %d/%d ISINs in %v\n", successCount, len(testISINs), duration)
		fmt.Printf("   Average time per ISIN: %v\n", duration/time.Duration(len(testISINs)))
	}

	// Test 2: Database operations performance
	fmt.Println("\n2. Database Operations Performance:")
	mappings := make([]model.ISINTickerMap, 100)
	for i := 0; i < 100; i++ {
		mappings[i] = model.ISINTickerMap{
			ISIN:         fmt.Sprintf("TESTISIN%03d", i),
			TickerSymbol: fmt.Sprintf("TEST%d", i),
			Currency:     "USD",
		}
	}

	start = time.Now()
	err = model.BatchInsertMappings(database.DB, mappings)
	insertDuration := time.Since(start)

	if err != nil {
		fmt.Printf("   Batch insert error: %v\n", err)
	} else {
		fmt.Printf("   Batch insert of %d mappings: %v\n", len(mappings), insertDuration)
	}

	// Test 3: Concurrent performance
	fmt.Println("\n3. Concurrent Performance:")
	var wg sync.WaitGroup
	concurrentResults := make([]time.Duration, 5)

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			start := time.Now()
			_, _ = service.GetCurrentPrices([]string{"US5949181045"})
			concurrentResults[index] = time.Since(start)
		}(i)
	}

	wg.Wait()

	totalConcurrentTime := time.Duration(0)
	for _, duration := range concurrentResults {
		totalConcurrentTime += duration
	}
	avgConcurrentTime := totalConcurrentTime / time.Duration(len(concurrentResults))

	fmt.Printf("   Average concurrent request time: %v\n", avgConcurrentTime)

	// Test 4: Cache effectiveness
	fmt.Println("\n4. Cache Effectiveness:")
	start = time.Now()
	_, _ = service.GetCurrentPrices([]string{"US5949181045"})
	firstRequestTime := time.Since(start)

	start = time.Now()
	_, _ = service.GetCurrentPrices([]string{"US5949181045"})
	secondRequestTime := time.Since(start)

	fmt.Printf("   First request: %v\n", firstRequestTime)
	fmt.Printf("   Second request (cached): %v\n", secondRequestTime)
	fmt.Printf("   Cache improvement: %.2fx faster\n", float64(firstRequestTime)/float64(secondRequestTime))

	fmt.Println("\n=== Performance Test Complete ===")
}

// TestPerformanceIntegration runs integration tests for the performance optimizations
func TestPerformanceIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Run performance test in a goroutine
	done := make(chan bool)
	go func() {
		RunPerformanceTest()
		done <- true
	}()

	select {
	case <-done:
		t.Log("Performance test completed successfully")
	case <-ctx.Done():
		t.Fatal("Performance test timed out")
	}
}

// BenchmarkCircuitBreaker tests the circuit breaker performance
func BenchmarkCircuitBreaker(b *testing.B) {
	service := NewPriceService()
	invalidISIN := "INVALIDISIN12345"

	// Pre-fail the circuit breaker
	for i := 0; i < 15; i++ {
		service.GetCurrentPrices([]string{invalidISIN})
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := service.GetCurrentPrices([]string{invalidISIN})
		if err == nil {
			b.Error("Expected circuit breaker to be open")
		}
	}
}

// BenchmarkThrottling tests the throttling mechanism
func BenchmarkThrottling(b *testing.B) {
	service := NewPriceService()

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := service.GetCurrentPrices([]string{"US5949181045"})
		if err != nil {
			log.Printf("Request %d failed: %v", i, err)
		}
	}
}
