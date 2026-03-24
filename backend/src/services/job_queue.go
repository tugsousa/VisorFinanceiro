package services

import (
	"fmt"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

// Job represents a background job
type Job struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt time.Time              `json:"created_at"`
	Status    string                 `json:"status"`
	Progress  float64                `json:"progress"`
	Error     string                 `json:"error,omitempty"`
}

// Job types
const (
	JobTypeRebuildHistory     = "rebuild_history"
	JobTypeUpdateMetrics      = "update_metrics"
	JobTypeFetchPrices        = "fetch_prices"
	JobTypeCalculateDividends = "calculate_dividends"
	JobTypeCacheWarming       = "cache_warming"
)

// JobStatus constants
const (
	JobStatusPending   = "pending"
	JobStatusRunning   = "running"
	JobStatusCompleted = "completed"
	JobStatusFailed    = "failed"
)

// JobQueue manages background jobs
type JobQueue struct {
	jobs       map[string]*Job
	workers    map[string]*JobWorker
	mu         sync.RWMutex
	maxJobs    int
	maxWorkers int
}

// JobWorker processes jobs
type JobWorker struct {
	ID       string
	Queue    *JobQueue
	StopChan chan struct{}
}

// JobResult represents the result of a job
type JobResult struct {
	JobID   string      `json:"job_id"`
	Success bool        `json:"success"`
	Error   string      `json:"error,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// NewJobQueue creates a new job queue
func NewJobQueue(maxJobs, maxWorkers int) *JobQueue {
	return &JobQueue{
		jobs:       make(map[string]*Job),
		workers:    make(map[string]*JobWorker),
		maxJobs:    maxJobs,
		maxWorkers: maxWorkers,
	}
}

// NewOptimizedJobQueue creates a job queue with optimized settings for better performance
func NewOptimizedJobQueue() *JobQueue {
	return NewJobQueue(200, 10) // Increased from 100 jobs, 5 workers
}

// AddJob adds a new job to the queue
func (jq *JobQueue) AddJob(jobType string, payload map[string]interface{}) (*Job, error) {
	jq.mu.Lock()
	defer jq.mu.Unlock()

	if len(jq.jobs) >= jq.maxJobs {
		return nil, fmt.Errorf("job queue is full")
	}

	jobID := fmt.Sprintf("%s_%d", jobType, time.Now().UnixNano())
	job := &Job{
		ID:        jobID,
		Type:      jobType,
		Payload:   payload,
		CreatedAt: time.Now(),
		Status:    JobStatusPending,
		Progress:  0,
	}

	jq.jobs[jobID] = job

	// Start processing immediately if we have available workers
	if len(jq.workers) < jq.maxWorkers {
		worker := jq.createWorker()
		go worker.processJob(job)
	}

	return job, nil
}

// GetJob retrieves a job by ID
func (jq *JobQueue) GetJob(jobID string) (*Job, bool) {
	jq.mu.RLock()
	defer jq.mu.RUnlock()

	job, exists := jq.jobs[jobID]
	return job, exists
}

// ListJobs returns all jobs
func (jq *JobQueue) ListJobs() []*Job {
	jq.mu.RLock()
	defer jq.mu.RUnlock()

	jobs := make([]*Job, 0, len(jq.jobs))
	for _, job := range jq.jobs {
		jobs = append(jobs, job)
	}
	return jobs
}

// createWorker creates a new worker
func (jq *JobQueue) createWorker() *JobWorker {
	workerID := fmt.Sprintf("worker_%d", time.Now().UnixNano())
	worker := &JobWorker{
		ID:       workerID,
		Queue:    jq,
		StopChan: make(chan struct{}),
	}
	jq.workers[workerID] = worker
	return worker
}

// processJob processes a single job
func (w *JobWorker) processJob(job *Job) {
	defer func() {
		// Clean up worker after job completion
		w.Queue.mu.Lock()
		delete(w.Queue.workers, w.ID)
		w.Queue.mu.Unlock()
	}()

	// Update job status to running
	w.updateJobStatus(job.ID, JobStatusRunning, 0, "")

	// Process the job based on its type
	var err error
	switch job.Type {
	case JobTypeRebuildHistory:
		err = w.processRebuildHistory(job)
	case JobTypeUpdateMetrics:
		err = w.processUpdateMetrics(job)
	case JobTypeFetchPrices:
		err = w.processFetchPrices(job)
	case JobTypeCalculateDividends:
		err = w.processCalculateDividends(job)
	case JobTypeCacheWarming:
		err = w.processCacheWarming(job)
	default:
		err = fmt.Errorf("unknown job type: %s", job.Type)
	}

	// Update final status
	if err != nil {
		w.updateJobStatus(job.ID, JobStatusFailed, 100, err.Error())
		logger.L.Error("Job failed", "job_id", job.ID, "error", err)
	} else {
		w.updateJobStatus(job.ID, JobStatusCompleted, 100, "")
		logger.L.Debug("Job completed successfully", "job_id", job.ID)
	}
}

// processRebuildHistory processes a history rebuild job
func (w *JobWorker) processRebuildHistory(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	// Get the upload service from payload
	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 10, "Starting history rebuild")

	// Rebuild history
	err := uploadService.RebuildUserHistory(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to rebuild history: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "History rebuild completed")
	return nil
}

// processUpdateMetrics processes a metrics update job
func (w *JobWorker) processUpdateMetrics(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	// Get the upload service from payload
	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 50, "Updating portfolio metrics")

	// Update metrics
	err := uploadService.UpdateUserPortfolioMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to update metrics: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Metrics update completed")
	return nil
}

// processFetchPrices processes a price fetching job
func (w *JobWorker) processFetchPrices(job *Job) error {
	// Get the price service from payload
	priceService, ok := job.Payload["price_service"].(PriceService)
	if !ok {
		return fmt.Errorf("price_service not found in payload")
	}

	// Get ISIN list
	isinList, ok := job.Payload["isin_list"].([]string)
	if !ok {
		return fmt.Errorf("invalid isin_list in payload")
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 20, "Fetching current prices")

	// Fetch prices
	_, err := priceService.GetCurrentPrices(isinList)
	if err != nil {
		return fmt.Errorf("failed to fetch prices: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Price fetching completed")
	return nil
}

// processCalculateDividends processes a dividend calculation job
func (w *JobWorker) processCalculateDividends(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	// Get the upload service from payload
	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 30, "Calculating dividend metrics")

	// Calculate dividend metrics
	_, err := uploadService.GetDividendMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to calculate dividend metrics: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Dividend calculation completed")
	return nil
}

// processCacheWarming processes a cache warming job
func (w *JobWorker) processCacheWarming(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	// Get the upload service from payload
	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 20, "Starting cache warming")

	// Get current holdings to warm cache with frequently accessed data
	holdings, err := uploadService.GetCurrentHoldingsWithValue(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to get current holdings: %w", err)
	}

	// Extract ISINs for cache warming
	var isinList []string
	for _, holding := range holdings {
		if holding.ISIN != "" {
			isinList = append(isinList, holding.ISIN)
		}
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 50, "Warming price cache")

	// Warm price cache for current holdings
	if len(isinList) > 0 {
		// Get price service from upload service (assuming it has access)
		// For now, we'll just call GetCurrentHoldingsWithValue again which will trigger cache warming
		_, err := uploadService.GetCurrentHoldingsWithValue(int64(userID), int64(portfolioID))
		if err != nil {
			logger.L.Warn("Failed to warm price cache", "error", err)
		}
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 80, "Warming dividend cache")

	// Warm dividend metrics cache
	_, err = uploadService.GetDividendMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		logger.L.Warn("Failed to warm dividend cache", "error", err)
	}

	// Update progress
	w.updateJobStatus(job.ID, JobStatusRunning, 90, "Warming historical data cache")

	// Warm historical chart data cache
	_, err = uploadService.GetHistoricalChartData(int64(userID), int64(portfolioID))
	if err != nil {
		logger.L.Warn("Failed to warm historical chart cache", "error", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Cache warming completed")
	return nil
}

// updateJobStatus updates the status of a job
func (w *JobWorker) updateJobStatus(jobID, status string, progress float64, errorMsg string) {
	w.Queue.mu.Lock()
	defer w.Queue.mu.Unlock()

	if job, exists := w.Queue.jobs[jobID]; exists {
		job.Status = status
		job.Progress = progress
		job.Error = errorMsg
	}
}

// Stop stops all workers and clears the queue
func (jq *JobQueue) Stop() {
	jq.mu.Lock()
	defer jq.mu.Unlock()

	// Stop all workers
	for _, worker := range jq.workers {
		close(worker.StopChan)
	}

	// Clear jobs
	jq.jobs = make(map[string]*Job)
	jq.workers = make(map[string]*JobWorker)
}

// JobManager manages the job queue and provides a simple interface
type JobManager struct {
	queue *JobQueue
}

// NewJobManager creates a new job manager
func NewJobManager() *JobManager {
	return &JobManager{
		queue: NewJobQueue(100, 5), // Max 100 jobs, 5 workers
	}
}

// NewOptimizedJobManager creates a job manager with optimized settings for better performance
func NewOptimizedJobManager() *JobManager {
	return &JobManager{
		queue: NewOptimizedJobQueue(), // Use optimized job queue
	}
}

// RebuildHistoryAsync starts an asynchronous history rebuild
func (jm *JobManager) RebuildHistoryAsync(uploadService UploadService, userID, portfolioID int64) (*Job, error) {
	payload := map[string]interface{}{
		"user_id":        float64(userID),
		"portfolio_id":   float64(portfolioID),
		"upload_service": uploadService,
		"started_at":     time.Now().Format(time.RFC3339),
	}

	return jm.queue.AddJob(JobTypeRebuildHistory, payload)
}

// UpdateMetricsAsync starts an asynchronous metrics update
func (jm *JobManager) UpdateMetricsAsync(uploadService UploadService, userID, portfolioID int64) (*Job, error) {
	payload := map[string]interface{}{
		"user_id":        float64(userID),
		"portfolio_id":   float64(portfolioID),
		"upload_service": uploadService,
		"started_at":     time.Now().Format(time.RFC3339),
	}

	return jm.queue.AddJob(JobTypeUpdateMetrics, payload)
}

// FetchPricesAsync starts an asynchronous price fetching
func (jm *JobManager) FetchPricesAsync(priceService PriceService, isinList []string) (*Job, error) {
	payload := map[string]interface{}{
		"isin_list":     isinList,
		"price_service": priceService,
		"started_at":    time.Now().Format(time.RFC3339),
	}

	return jm.queue.AddJob(JobTypeFetchPrices, payload)
}

// CalculateDividendsAsync starts an asynchronous dividend calculation
func (jm *JobManager) CalculateDividendsAsync(uploadService UploadService, userID, portfolioID int64) (*Job, error) {
	payload := map[string]interface{}{
		"user_id":        float64(userID),
		"portfolio_id":   float64(portfolioID),
		"upload_service": uploadService,
		"started_at":     time.Now().Format(time.RFC3339),
	}

	return jm.queue.AddJob(JobTypeCalculateDividends, payload)
}

// CacheWarmingAsync starts an asynchronous cache warming job
func (jm *JobManager) CacheWarmingAsync(uploadService UploadService, userID, portfolioID int64) (*Job, error) {
	payload := map[string]interface{}{
		"user_id":        float64(userID),
		"portfolio_id":   float64(portfolioID),
		"upload_service": uploadService,
		"started_at":     time.Now().Format(time.RFC3339),
	}

	return jm.queue.AddJob(JobTypeCacheWarming, payload)
}

// GetJob retrieves a job by ID
func (jm *JobManager) GetJob(jobID string) (*Job, bool) {
	return jm.queue.GetJob(jobID)
}

// ListJobs returns all jobs
func (jm *JobManager) ListJobs() []*Job {
	return jm.queue.ListJobs()
}

// Stop stops the job manager
func (jm *JobManager) Stop() {
	jm.queue.Stop()
}
