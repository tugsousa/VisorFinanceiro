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

// NewOptimizedJobQueue creates a job queue with optimized settings
func NewOptimizedJobQueue() *JobQueue {
	return NewJobQueue(200, 10)
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
		w.Queue.mu.Lock()
		delete(w.Queue.workers, w.ID)
		w.Queue.mu.Unlock()
	}()

	w.updateJobStatus(job.ID, JobStatusRunning, 0, "")

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

	if err != nil {
		w.updateJobStatus(job.ID, JobStatusFailed, 100, err.Error())
		logger.L.Error("Job failed", "job_id", job.ID, "error", err)
	} else {
		w.updateJobStatus(job.ID, JobStatusCompleted, 100, "")
		logger.L.Debug("Job completed successfully", "job_id", job.ID)
	}
}

// processRebuildHistory processes a history rebuild job.
// FIX #7: reads the optional "from_date" field from the payload so that
// incremental uploads only rebuild the affected portion of the timeline.
func (w *JobWorker) processRebuildHistory(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	// FIX #7: use incremental rebuild when a from_date was provided.
	fromDate, _ := job.Payload["from_date"].(string)

	w.updateJobStatus(job.ID, JobStatusRunning, 10, "Starting history rebuild")

	var err error
	if fromDate != "" {
		err = uploadService.RebuildUserHistoryFrom(int64(userID), int64(portfolioID), fromDate)
	} else {
		err = uploadService.RebuildUserHistory(int64(userID), int64(portfolioID))
	}
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

	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 50, "Updating portfolio metrics")

	err := uploadService.UpdateUserPortfolioMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to update metrics: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Metrics update completed")
	return nil
}

// processFetchPrices processes a price fetching job
func (w *JobWorker) processFetchPrices(job *Job) error {
	priceService, ok := job.Payload["price_service"].(PriceService)
	if !ok {
		return fmt.Errorf("price_service not found in payload")
	}

	isinList, ok := job.Payload["isin_list"].([]string)
	if !ok {
		return fmt.Errorf("invalid isin_list in payload")
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 20, "Fetching current prices")

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

	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 30, "Calculating dividend metrics")

	_, err := uploadService.GetDividendMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		return fmt.Errorf("failed to calculate dividend metrics: %w", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 100, "Dividend calculation completed")
	return nil
}

// processCacheWarming warms the key caches after an upload.
// FIX #4: removed the duplicate GetCurrentHoldingsWithValue call that was
// fetching live prices twice for no reason.  The first call already populates
// the short-TTL reportCache entry (ckCurrentHoldingsValue), so subsequent
// calls within the same 2-minute window are free.
func (w *JobWorker) processCacheWarming(job *Job) error {
	userID, ok := job.Payload["user_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid user_id in payload")
	}

	portfolioID, ok := job.Payload["portfolio_id"].(float64)
	if !ok {
		return fmt.Errorf("invalid portfolio_id in payload")
	}

	uploadService, ok := job.Payload["upload_service"].(UploadService)
	if !ok {
		return fmt.Errorf("upload_service not found in payload")
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 20, "Starting cache warming")

	// First call: fetches live prices and caches the result.
	_, err := uploadService.GetCurrentHoldingsWithValue(int64(userID), int64(portfolioID))
	if err != nil {
		// Non-fatal: log and continue warming other caches.
		logger.L.Warn("Failed to warm holdings cache", "error", err)
	}

	// FIX #4: the second GetCurrentHoldingsWithValue that used to live here has
	// been removed.  It was a direct duplicate of the call above and caused an
	// unnecessary extra HTTP round-trip to Yahoo Finance.

	w.updateJobStatus(job.ID, JobStatusRunning, 60, "Warming dividend cache")

	_, err = uploadService.GetDividendMetrics(int64(userID), int64(portfolioID))
	if err != nil {
		logger.L.Warn("Failed to warm dividend cache", "error", err)
	}

	w.updateJobStatus(job.ID, JobStatusRunning, 80, "Warming historical data cache")

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

	for _, worker := range jq.workers {
		close(worker.StopChan)
	}

	jq.jobs = make(map[string]*Job)
	jq.workers = make(map[string]*JobWorker)
}

// ---------------------------------------------------------------------------
// JobManager
// ---------------------------------------------------------------------------

// JobManager manages the job queue and provides a simple interface
type JobManager struct {
	queue *JobQueue
}

// NewJobManager creates a new job manager
func NewJobManager() *JobManager {
	return &JobManager{
		queue: NewJobQueue(100, 5),
	}
}

// NewOptimizedJobManager creates a job manager with optimized settings
func NewOptimizedJobManager() *JobManager {
	return &JobManager{
		queue: NewOptimizedJobQueue(),
	}
}

// RebuildHistoryAsync starts an asynchronous history rebuild.
// FIX #7: accepts fromDate (DD-MM-YYYY) so incremental uploads only rebuild
// the affected portion of the snapshot timeline.  Pass "" for a full rebuild.
func (jm *JobManager) RebuildHistoryAsync(uploadService UploadService, userID, portfolioID int64, fromDate string) (*Job, error) {
	payload := map[string]interface{}{
		"user_id":        float64(userID),
		"portfolio_id":   float64(portfolioID),
		"upload_service": uploadService,
		"from_date":      fromDate, // FIX #7: "" means full rebuild
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
