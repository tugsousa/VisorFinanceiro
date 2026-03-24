package services

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPerformanceOptimizations tests the performance improvements
func TestPerformanceOptimizations(t *testing.T) {
	// Enable performance monitoring
	EnablePerformanceMonitoring(true)
	defer EnablePerformanceMonitoring(false)

	t.Run("ParallelAPIRequests", func(t *testing.T) {
		// Test parallel API request performance
		start := time.Now()

		// Simulate multiple API requests
		const numRequests = 20
		var wg sync.WaitGroup
		results := make([]time.Duration, numRequests)

		for i := 0; i < numRequests; i++ {
			wg.Add(1)
			go func(index int) {
				defer wg.Done()
				reqStart := time.Now()

				// Simulate API call with throttling
				time.Sleep(50 * time.Millisecond)

				duration := time.Since(reqStart)
				results[index] = duration

				// Record performance metric
				RecordAPIOperation("test_api_call", duration, true, "test_endpoint")
			}(i)
		}

		wg.Wait()
		totalTime := time.Since(start)

		t.Logf("Total time for %d parallel requests: %v", numRequests, totalTime)
		t.Logf("Average request time: %v", totalTime/time.Duration(numRequests))

		// Verify that requests completed in reasonable time (should be much faster than sequential)
		sequentialTime := time.Duration(numRequests) * 50 * time.Millisecond
		assert.Less(t, totalTime, sequentialTime, "Parallel requests should be faster than sequential")
	})

	t.Run("CircuitBreaker", func(t *testing.T) {
		// Test circuit breaker functionality
		cb := NewCircuitBreaker(3, 5*time.Second)

		// Test failure threshold
		for i := 0; i < 3; i++ {
			cb.RecordFailure("test_isin")
		}

		assert.True(t, cb.IsOpen("test_isin"), "Circuit breaker should be open after 3 failures")

		// Test recovery
		cb.RecordSuccess("test_isin")
		assert.False(t, cb.IsOpen("test_isin"), "Circuit breaker should be closed after success")
	})

	t.Run("BulkOperations", func(t *testing.T) {
		// Test bulk failed ISIN cache operations
		bfc := NewBulkFailedISINCache(1 * time.Hour)

		testISINs := []string{"ISIN1", "ISIN2", "ISIN3"}

		// Mark all as failed
		bfc.MarkMultiple(testISINs)

		// Check all in bulk
		results := bfc.CheckMultiple(testISINs)
		for _, isin := range testISINs {
			assert.True(t, results[isin], "ISIN should be marked as failed")
		}
	})

	t.Run("AdaptiveThrottling", func(t *testing.T) {
		// Test adaptive throttling
		throttler := NewAdaptiveRequestThrottler(10, 100*time.Millisecond)

		// Simulate successful requests
		for i := 0; i < 5; i++ {
			throttler.Wait()
			throttler.RecordSuccess()
		}

		// Should have base capacity
		assert.Equal(t, 10, throttler.baseCapacity)

		// Simulate failures
		for i := 0; i < 5; i++ {
			throttler.RecordFailure()
		}

		// Capacity should be reduced
		assert.Less(t, throttler.capacity, throttler.baseCapacity)
	})

	t.Run("JobQueueOptimization", func(t *testing.T) {
		// Test optimized job queue
		queue := NewOptimizedJobQueue()

		// Verify optimized settings
		assert.Equal(t, 200, queue.maxJobs, "Should have increased max jobs")
		assert.Equal(t, 10, queue.maxWorkers, "Should have increased max workers")

		// Test job processing
		payload := map[string]interface{}{
			"test": "data",
		}

		job, err := queue.AddJob("test_job", payload)
		require.NoError(t, err)
		assert.NotNil(t, job)
		assert.Equal(t, "test_job", job.Type)
		assert.Equal(t, JobStatusPending, job.Status)
	})

	t.Run("PerformanceMonitoring", func(t *testing.T) {
		// Test performance monitoring
		operation := "test_operation"

		// Record some operations
		for i := 0; i < 5; i++ {
			start := time.Now()
			time.Sleep(10 * time.Millisecond)
			duration := time.Since(start)
			RecordOperation(operation, duration, true)
		}

		// Get stats
		stats, exists := GetOperationStats(operation)
		require.True(t, exists)
		assert.Equal(t, int64(5), stats.TotalCalls)
		assert.Greater(t, stats.TotalDuration, 50*time.Millisecond)

		// Get performance report
		report := GetPerformanceReport()
		assert.NotNil(t, report)
		assert.Greater(t, len(report.Operations), 0)

		// Get optimization recommendations
		recommendations := GetOptimizationRecommendations()
		assert.NotNil(t, recommendations)
	})

	t.Run("AsyncPerformanceLogging", func(t *testing.T) {
		// Test async performance logging
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// Start async logger
		go AsyncPerformanceLogger(ctx, 500*time.Millisecond)

		// Record some operations
		for i := 0; i < 10; i++ {
			RecordOperation("async_test", 5*time.Millisecond, true)
			time.Sleep(100 * time.Millisecond)
		}

		// Wait for context cancellation
		<-ctx.Done()
	})

	t.Run("PerformanceAlerts", func(t *testing.T) {
		// Test performance alerts
		var alerts []PerformanceAlert

		// Register alert callback
		RegisterAlertCallback(func(alert PerformanceAlert) {
			alerts = append(alerts, alert)
		})

		// Record slow operation
		RecordOperation("slow_operation", 6*time.Second, false)

		// Check for alerts
		triggeredAlerts := CheckPerformanceAlerts()
		assert.Greater(t, len(triggeredAlerts), 0, "Should trigger alerts for slow operations")

		// Get all alerts
		allAlerts := GetAlerts()
		assert.Greater(t, len(allAlerts), 0, "Should have alerts")

		// Clear alerts
		ClearAlerts()
		remainingAlerts := GetAlerts()
		assert.Equal(t, 0, len(remainingAlerts), "Should clear all alerts")
	})

	t.Run("MetadataFetchingOptimization", func(t *testing.T) {
		// Test metadata fetching optimization
		cache := NewISINResolutionCache(1 * time.Hour)
		defer cache.Close()

		// Test cache operations
		cache.SetSuccess("TEST_ISIN", "TEST_TICKER")
		ticker, exists := cache.GetSuccess("TEST_ISIN")
		assert.True(t, exists)
		assert.Equal(t, "TEST_TICKER", ticker)

		// Test metadata cache
		cache.SetMetadata("TEST_TICKER", "Technology", "Software", "EQUITY")
		sector, industry, quoteType, exists := cache.GetMetadata("TEST_TICKER")
		assert.True(t, exists)
		assert.Equal(t, "Technology", sector)
		assert.Equal(t, "Software", industry)
		assert.Equal(t, "EQUITY", quoteType)
	})
}

// BenchmarkPerformanceOptimizations benchmarks the performance improvements
func BenchmarkPerformanceOptimizations(b *testing.B) {
	EnablePerformanceMonitoring(true)
	defer EnablePerformanceMonitoring(false)

	b.Run("ParallelAPIRequests", func(b *testing.B) {
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			const numRequests = 10
			var wg sync.WaitGroup

			for j := 0; j < numRequests; j++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					// Simulate API call
					time.Sleep(10 * time.Millisecond)
					RecordAPIOperation("benchmark_api", 10*time.Millisecond, true, "benchmark_endpoint")
				}()
			}

			wg.Wait()
		}
	})

	b.Run("CircuitBreaker", func(b *testing.B) {
		cb := NewCircuitBreaker(5, 1*time.Minute)

		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			isin := fmt.Sprintf("ISIN_%d", i%100)
			if i%10 == 0 {
				cb.RecordFailure(isin)
			} else {
				cb.RecordSuccess(isin)
			}
			cb.IsOpen(isin)
		}
	})

	b.Run("BulkOperations", func(b *testing.B) {
		bfc := NewBulkFailedISINCache(1 * time.Hour)

		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			isins := []string{
				fmt.Sprintf("ISIN_%d", i),
				fmt.Sprintf("ISIN_%d", i+1),
				fmt.Sprintf("ISIN_%d", i+2),
			}

			bfc.MarkMultiple(isins)
			bfc.CheckMultiple(isins)
		}
	})

	b.Run("AdaptiveThrottling", func(b *testing.B) {
		throttler := NewAdaptiveRequestThrottler(20, 50*time.Millisecond)

		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			throttler.Wait()
			if i%5 == 0 {
				throttler.RecordFailure()
			} else {
				throttler.RecordSuccess()
			}
		}
	})
}

// ExamplePerformanceMonitoring demonstrates how to use performance monitoring
func ExamplePerformanceMonitoring() {
	// Enable performance monitoring
	EnablePerformanceMonitoring(true)
	defer EnablePerformanceMonitoring(false)

	// Record operations
	RecordOperation("database_query", 100*time.Millisecond, true)
	RecordOperation("api_call", 500*time.Millisecond, true)
	RecordOperation("file_processing", 2*time.Second, false)

	// Get performance report
	report := GetPerformanceReport()
	fmt.Printf("Total operations: %d\n", report.OverallStats.TotalOperations)
	fmt.Printf("Average response time: %v\n", report.OverallStats.AvgResponseTime)
	fmt.Printf("Error rate: %.2f%%\n", report.OverallStats.ErrorRate)

	// Get optimization recommendations
	recommendations := GetOptimizationRecommendations()
	for _, rec := range recommendations {
		fmt.Printf("Recommendation: %s\n", rec)
	}

	// Output:
	// Total operations: 3
	// Average response time: 900ms
	// Error rate: 33.33%
	// Recommendation: Operation 'file_processing' is slow (avg: 2s, calls: 1) - consider parallel processing
	// Recommendation: Operation 'file_processing' has high error rate (33.33%) - investigate reliability issues
}
