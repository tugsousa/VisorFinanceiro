package handlers

import (
	"TAXFOLIO/src/services" // Import the new services package
	"encoding/json"
	"fmt"
	"net/http"
	// "TAXFOLIO/src/models" // No longer directly needed
	// "TAXFOLIO/src/parsers" // No longer directly needed
	// "TAXFOLIO/src/processors" // No longer directly needed
)

// UploadHandler handles file uploads by delegating to UploadService.
type UploadHandler struct {
	uploadService services.UploadService // Dependency on the service interface
}

// NewUploadHandler creates a new UploadHandler with its dependencies.
func NewUploadHandler(service services.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: service,
	}
}

// HandleUpload receives the file, passes it to the service, and returns the result.
func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	// 1. Parse multipart form to get the file (max 10 MB file size)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, fmt.Sprintf("failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}

	// 2. Get the file from the request
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to retrieve file from request: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close() // Ensure the file is closed

	// 3. Delegate processing to the UploadService
	result, err := h.uploadService.ProcessUpload(file)
	if err != nil {
		// Determine appropriate HTTP status code based on error type if needed
		// For now, using InternalServerError for any processing error
		http.Error(w, fmt.Sprintf("Error processing upload: %v", err), http.StatusInternalServerError)
		return
	}

	// 4. Return the result as JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

// parseUploadedFile function is removed as its logic is now handled by the service layer.
