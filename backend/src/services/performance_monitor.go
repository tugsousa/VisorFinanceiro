// backend/src/services/performance_monitor.go
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

// PerformanceMetrics tracks key performance indicators
type PerformanceMetrics struct {
	mu              sync.RWMutex
	metrics         map[string]*MetricStats
	operationCounts map[string]int64
	lastReset       time.Time
	enabled         bool
}

type MetricStats struct {
	TotalCalls    int64
	TotalDuration time.Duration
	MinDuration   time.Duration
	MaxDuration   time.Duration
	Errors        int64
	LastUpdated   time.Time
}

type PerformanceReport struct {
	StartTime         time.Time              `json:"start_time"`
	EndTime           time.Time              `json:"end_time"`
	Operations        map[string]MetricStats `json:"operations"`
	OperationCounts   map[string]int64       `json:"operation_counts"`
	TopSlowOperations []SlowOperation        `json:"top_slow_operations"`
	OverallStats      OverallStats           `json:"overall_stats"`
}

type SlowOperation struct {
	Operation string        `json:"operation"`
	AvgTime   time.Duration `json:"avg_time"`
	CallCount int64         `json:"call_count"`
}

type OverallStats struct {
	TotalOperations int64         `json:"total_operations"`
	TotalDuration   time.Duration `json:"total_duration"`
	AvgResponseTime time.Duration `json:"avg_response_time"`
	ErrorRate       float64       `json:"error_rate"`
}

var performanceMonitor = &PerformanceMetrics{
	metrics:         make(map[string]*MetricStats),
	operationCounts: make(map[string]int64),
	lastReset:       time.Now(),
	enabled:         true,
}

// EnablePerformanceMonitoring enables or disables performance monitoring
func EnablePerformanceMonitoring(enabled bool) {
	performanceMonitor.mu.Lock()
	defer performanceMonitor.mu.Unlock()
	performanceMonitor.enabled = enabled
	if enabled {
		logger.L.Info("Performance monitoring enabled")
	} else {
		logger.L.Info("Performance monitoring disabled")
	}
}

// RecordOperation records the duration and success/failure of an operation
func RecordOperation(operation string, duration time.Duration, success bool) {
	if !performanceMonitor.enabled {
		return
	}

	performanceMonitor.mu.Lock()
	defer performanceMonitor.mu.Unlock()

	stats, exists := performanceMonitor.metrics[operation]
	if !exists {
		stats = &MetricStats{
			MinDuration: time.Duration(9223372036854775807), // Max int64
		}
		performanceMonitor.metrics[operation] = stats
	}

	stats.TotalCalls++
	stats.TotalDuration += duration
	stats.LastUpdated = time.Now()

	if duration < stats.MinDuration {
		stats.MinDuration = duration
	}
	if duration > stats.MaxDuration {
		stats.MaxDuration = duration
	}

	if !success {
		stats.Errors++
	}

	// Track operation counts for frequency analysis
	performanceMonitor.operationCounts[operation]++
}

// RecordAPIOperation records API call performance with enhanced metrics
func RecordAPIOperation(operation string, duration time.Duration, success bool, apiEndpoint string) {
	// Record general operation
	RecordOperation(operation, duration, success)

	// Record API-specific metrics
	apiOperation := fmt.Sprintf("api_%s_%s", operation, apiEndpoint)
	RecordOperation(apiOperation, duration, success)
}

// GetSlowOperationsWithThreshold returns operations that are slower than the threshold with detailed analysis
func GetSlowOperationsWithThreshold(threshold time.Duration) []SlowOperation {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	var slowOps []SlowOperation
	for op, stats := range performanceMonitor.metrics {
		if stats.TotalCalls > 0 {
			avgTime := stats.TotalDuration / time.Duration(stats.TotalCalls)
			if avgTime > threshold {
				slowOps = append(slowOps, SlowOperation{
					Operation: op,
					AvgTime:   avgTime,
					CallCount: stats.TotalCalls,
				})
			}
		}
	}
	return slowOps
}

// GetOptimizationRecommendations provides recommendations for performance improvements
func GetOptimizationRecommendations() []string {
	recommendations := []string{}

	// Check for slow operations
	slowOps := GetSlowOperationsWithThreshold(1 * time.Second)
	for _, op := range slowOps {
		if strings.Contains(op.Operation, "api_") {
			recommendations = append(recommendations,
				fmt.Sprintf("API call '%s' is slow (avg: %v, calls: %d) - consider caching or parallelization",
					op.Operation, op.AvgTime, op.CallCount))
		} else if strings.Contains(op.Operation, "database") {
			recommendations = append(recommendations,
				fmt.Sprintf("Database operation '%s' is slow (avg: %v, calls: %d) - consider query optimization",
					op.Operation, op.AvgTime, op.CallCount))
		} else if strings.Contains(op.Operation, "upload") {
			recommendations = append(recommendations,
				fmt.Sprintf("Upload operation '%s' is slow (avg: %v, calls: %d) - consider parallel processing",
					op.Operation, op.AvgTime, op.CallCount))
		}
	}

	// Check for high error rates
	for op, stats := range performanceMonitor.metrics {
		if stats.TotalCalls > 10 {
			errorRate := float64(stats.Errors) / float64(stats.TotalCalls) * 100
			if errorRate > 5 {
				recommendations = append(recommendations,
					fmt.Sprintf("Operation '%s' has high error rate (%.2f%%) - investigate reliability issues",
						op, errorRate))
			}
		}
	}

	// Check for high frequency operations
	frequentOps := GetFrequentOperations(100)
	for op, count := range frequentOps {
		recommendations = append(recommendations,
			fmt.Sprintf("Operation '%s' is called frequently (%d times) - consider batching or caching",
				op, count))
	}

	return recommendations
}

// RecordOperationWithFunc is a convenience function that records an operation automatically
func RecordOperationWithFunc(operation string, fn func() error) error {
	start := time.Now()
	err := fn()
	duration := time.Since(start)
	success := err == nil
	RecordOperation(operation, duration, success)
	return err
}

// GetPerformanceReport generates a comprehensive performance report
func GetPerformanceReport() *PerformanceReport {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	report := &PerformanceReport{
		StartTime:       performanceMonitor.lastReset,
		EndTime:         time.Now(),
		Operations:      make(map[string]MetricStats),
		OperationCounts: make(map[string]int64),
	}

	// Copy metrics
	for op, stats := range performanceMonitor.metrics {
		report.Operations[op] = *stats
	}

	// Copy operation counts
	for op, count := range performanceMonitor.operationCounts {
		report.OperationCounts[op] = count
	}

	// Calculate top slow operations
	slowOps := make([]SlowOperation, 0, len(report.Operations))
	for op, stats := range report.Operations {
		if stats.TotalCalls > 0 {
			avgTime := stats.TotalDuration / time.Duration(stats.TotalCalls)
			slowOps = append(slowOps, SlowOperation{
				Operation: op,
				AvgTime:   avgTime,
				CallCount: stats.TotalCalls,
			})
		}
	}

	// Sort by average time (descending)
	for i := 0; i < len(slowOps)-1; i++ {
		for j := i + 1; j < len(slowOps); j++ {
			if slowOps[i].AvgTime < slowOps[j].AvgTime {
				slowOps[i], slowOps[j] = slowOps[j], slowOps[i]
			}
		}
	}

	// Limit to top 10
	if len(slowOps) > 10 {
		slowOps = slowOps[:10]
	}
	report.TopSlowOperations = slowOps

	// Calculate overall stats
	var totalOps int64
	var totalDuration time.Duration
	var totalErrors int64

	for _, stats := range report.Operations {
		totalOps += stats.TotalCalls
		totalDuration += stats.TotalDuration
		totalErrors += stats.Errors
	}

	report.OverallStats = OverallStats{
		TotalOperations: totalOps,
		TotalDuration:   totalDuration,
		ErrorRate:       0,
	}

	if totalOps > 0 {
		report.OverallStats.AvgResponseTime = totalDuration / time.Duration(totalOps)
		report.OverallStats.ErrorRate = float64(totalErrors) / float64(totalOps) * 100
	}

	return report
}

// ResetPerformanceMetrics resets all performance metrics
func ResetPerformanceMetrics() {
	performanceMonitor.mu.Lock()
	defer performanceMonitor.mu.Unlock()

	performanceMonitor.metrics = make(map[string]*MetricStats)
	performanceMonitor.operationCounts = make(map[string]int64)
	performanceMonitor.lastReset = time.Now()
	logger.L.Info("Performance metrics reset")
}

// LogPerformanceReport logs the performance report
func LogPerformanceReport() {
	report := GetPerformanceReport()
	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		logger.L.Error("Failed to marshal performance report", "error", err)
		return
	}

	logger.L.Info("Performance Report",
		"report", string(reportJSON),
	)
}

// PerformanceMiddleware creates middleware that automatically records operation performance
func PerformanceMiddleware(operation string) func(func() error) error {
	return func(fn func() error) error {
		return RecordOperationWithFunc(operation, fn)
	}
}

// AsyncPerformanceLogger logs performance metrics periodically
func AsyncPerformanceLogger(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			LogPerformanceReport()
		}
	}
}

// GetOperationStats returns statistics for a specific operation
func GetOperationStats(operation string) (*MetricStats, bool) {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	stats, exists := performanceMonitor.metrics[operation]
	if !exists {
		return nil, false
	}

	// Return a copy to avoid race conditions
	return &MetricStats{
		TotalCalls:    stats.TotalCalls,
		TotalDuration: stats.TotalDuration,
		MinDuration:   stats.MinDuration,
		MaxDuration:   stats.MaxDuration,
		Errors:        stats.Errors,
		LastUpdated:   stats.LastUpdated,
	}, true
}

// GetSlowOperations returns operations that are slower than the threshold
func GetSlowOperations(threshold time.Duration) []SlowOperation {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	var slowOps []SlowOperation
	for op, stats := range performanceMonitor.metrics {
		if stats.TotalCalls > 0 {
			avgTime := stats.TotalDuration / time.Duration(stats.TotalCalls)
			if avgTime > threshold {
				slowOps = append(slowOps, SlowOperation{
					Operation: op,
					AvgTime:   avgTime,
					CallCount: stats.TotalCalls,
				})
			}
		}
	}
	return slowOps
}

// GetFrequentOperations returns operations that are called more than the threshold
func GetFrequentOperations(threshold int64) map[string]int64 {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	frequentOps := make(map[string]int64)
	for op, count := range performanceMonitor.operationCounts {
		if count > threshold {
			frequentOps[op] = count
		}
	}
	return frequentOps
}

// PerformanceAlert represents a performance issue that needs attention
type PerformanceAlert struct {
	Operation    string      `json:"operation"`
	Issue        string      `json:"issue"`
	CurrentValue interface{} `json:"current_value"`
	Threshold    interface{} `json:"threshold"`
	Severity     string      `json:"severity"` // LOW, MEDIUM, HIGH, CRITICAL
	Timestamp    time.Time   `json:"timestamp"`
}

// PerformanceAlertManager manages performance alerts
type PerformanceAlertManager struct {
	mu        sync.RWMutex
	alerts    []PerformanceAlert
	callbacks []func(PerformanceAlert)
}

var alertManager = &PerformanceAlertManager{
	callbacks: make([]func(PerformanceAlert), 0),
}

// RegisterAlertCallback registers a callback function to be called when an alert is triggered
func RegisterAlertCallback(callback func(PerformanceAlert)) {
	alertManager.mu.Lock()
	defer alertManager.mu.Unlock()
	alertManager.callbacks = append(alertManager.callbacks, callback)
}

// CheckPerformanceAlerts checks for performance issues and triggers alerts
func CheckPerformanceAlerts() []PerformanceAlert {
	performanceMonitor.mu.RLock()
	defer performanceMonitor.mu.RUnlock()

	var alerts []PerformanceAlert

	// Check for slow operations (avg response time > 5 seconds)
	for op, stats := range performanceMonitor.metrics {
		if stats.TotalCalls > 0 {
			avgTime := stats.TotalDuration / time.Duration(stats.TotalCalls)
			if avgTime > 5*time.Second {
				alert := PerformanceAlert{
					Operation:    op,
					Issue:        "High average response time",
					CurrentValue: avgTime.String(),
					Threshold:    "5s",
					Severity:     "HIGH",
					Timestamp:    time.Now(),
				}
				alerts = append(alerts, alert)
				triggerAlert(alert)
			}
		}
	}

	// Check for high error rates (> 5%)
	for op, stats := range performanceMonitor.metrics {
		if stats.TotalCalls > 10 { // Only check if there are enough samples
			errorRate := float64(stats.Errors) / float64(stats.TotalCalls) * 100
			if errorRate > 5 {
				alert := PerformanceAlert{
					Operation:    op,
					Issue:        "High error rate",
					CurrentValue: fmt.Sprintf("%.2f%%", errorRate),
					Threshold:    "5%",
					Severity:     "CRITICAL",
					Timestamp:    time.Now(),
				}
				alerts = append(alerts, alert)
				triggerAlert(alert)
			}
		}
	}

	// Check for operations with very high call frequency (> 1000 calls)
	for op, count := range performanceMonitor.operationCounts {
		if count > 1000 {
			alert := PerformanceAlert{
				Operation:    op,
				Issue:        "High call frequency",
				CurrentValue: count,
				Threshold:    1000,
				Severity:     "MEDIUM",
				Timestamp:    time.Now(),
			}
			alerts = append(alerts, alert)
			triggerAlert(alert)
		}
	}

	return alerts
}

func triggerAlert(alert PerformanceAlert) {
	alertManager.mu.RLock()
	defer alertManager.mu.RUnlock()

	for _, callback := range alertManager.callbacks {
		go callback(alert) // Execute callbacks asynchronously
	}
}

// GetAlerts returns all recent performance alerts
func GetAlerts() []PerformanceAlert {
	alertManager.mu.RLock()
	defer alertManager.mu.RUnlock()

	// Return a copy to avoid race conditions
	alertsCopy := make([]PerformanceAlert, len(alertManager.alerts))
	copy(alertsCopy, alertManager.alerts)
	return alertsCopy
}

// ClearAlerts clears all performance alerts
func ClearAlerts() {
	alertManager.mu.Lock()
	defer alertManager.mu.Unlock()
	alertManager.alerts = nil
	logger.L.Info("Performance alerts cleared")
}
