package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/services"
)

// JobHandler handles job-related HTTP requests
type JobHandler struct {
	uploadService services.UploadService
	jobManager    *services.JobManager
}

// NewJobHandler creates a new job handler
func NewJobHandler(uploadService services.UploadService, jobManager *services.JobManager) *JobHandler {
	return &JobHandler{
		uploadService: uploadService,
		jobManager:    jobManager,
	}
}

// GetJobsHandler returns all jobs for a user
func (h *JobHandler) GetJobsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	jobs := h.jobManager.ListJobs()

	userJobs := make([]*services.Job, 0)
	for _, job := range jobs {
		if job.Payload["user_id"] == float64(userID) {
			userJobs = append(userJobs, job)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"jobs":  userJobs,
		"count": len(userJobs),
	})
}

// GetJobHandler returns a specific job by ID
func (h *JobHandler) GetJobHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "Job ID is required", http.StatusBadRequest)
		return
	}

	job, exists := h.jobManager.GetJob(jobID)
	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	if job.Payload["user_id"] != float64(userID) {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// RebuildHistoryHandler triggers a full history rebuild job.
// Manual triggers always do a full rebuild (fromDate = "").
func (h *JobHandler) RebuildHistoryHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		http.Error(w, "Portfolio ID is required", http.StatusBadRequest)
		return
	}

	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid portfolio ID", http.StatusBadRequest)
		return
	}

	// Pass "" as fromDate so the worker performs a full rebuild.
	job, err := h.jobManager.RebuildHistoryAsync(h.uploadService, userID, portfolioID, "")
	if err != nil {
		logger.L.Error("Failed to start history rebuild job", "userID", userID, "portfolioID", portfolioID, "error", err)
		http.Error(w, "Failed to start job", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id":  job.ID,
		"status":  job.Status,
		"type":    job.Type,
		"message": "History rebuild job started successfully",
	})
}

// UpdateMetricsHandler triggers a metrics update job
func (h *JobHandler) UpdateMetricsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		http.Error(w, "Portfolio ID is required", http.StatusBadRequest)
		return
	}

	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid portfolio ID", http.StatusBadRequest)
		return
	}

	job, err := h.jobManager.UpdateMetricsAsync(h.uploadService, userID, portfolioID)
	if err != nil {
		logger.L.Error("Failed to start metrics update job", "userID", userID, "portfolioID", portfolioID, "error", err)
		http.Error(w, "Failed to start job", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id":  job.ID,
		"status":  job.Status,
		"type":    job.Type,
		"message": "Metrics update job started successfully",
	})
}

// CalculateDividendsHandler triggers a dividend calculation job
func (h *JobHandler) CalculateDividendsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		http.Error(w, "Portfolio ID is required", http.StatusBadRequest)
		return
	}

	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid portfolio ID", http.StatusBadRequest)
		return
	}

	job, err := h.jobManager.CalculateDividendsAsync(h.uploadService, userID, portfolioID)
	if err != nil {
		logger.L.Error("Failed to start dividend calculation job", "userID", userID, "portfolioID", portfolioID, "error", err)
		http.Error(w, "Failed to start job", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id":  job.ID,
		"status":  job.Status,
		"type":    job.Type,
		"message": "Dividend calculation job started successfully",
	})
}

// RegisterJobRoutes registers job-related routes
func RegisterJobRoutes(mux *http.ServeMux, jobHandler *JobHandler) {
	mux.HandleFunc("GET /api/jobs", jobHandler.GetJobsHandler)
	mux.HandleFunc("GET /api/job", jobHandler.GetJobHandler)
	mux.HandleFunc("POST /api/jobs/rebuild-history", jobHandler.RebuildHistoryHandler)
	mux.HandleFunc("POST /api/jobs/update-metrics", jobHandler.UpdateMetricsHandler)
	mux.HandleFunc("POST /api/jobs/calculate-dividends", jobHandler.CalculateDividendsHandler)
}
