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

// HandleGetStockSales retrieves the latest processed stock sale details.
func (h *UploadHandler) HandleGetStockSales(w http.ResponseWriter, r *http.Request) {
	// 1. Get the latest result from the service
	result, err := h.uploadService.GetLatestUploadResult()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		http.Error(w, fmt.Sprintf("Error retrieving latest results: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return only the StockSaleDetails as JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result.StockSaleDetails); err != nil {
		http.Error(w, "Error generating JSON response for stock sales", http.StatusInternalServerError)
	}
}

// HandleGetOptionSales retrieves the latest processed option sale details.
func (h *UploadHandler) HandleGetOptionSales(w http.ResponseWriter, r *http.Request) {
	// 1. Get the latest result from the service
	result, err := h.uploadService.GetLatestUploadResult()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		// Return an empty JSON object or array if no data is found, instead of an error,
		// to match the frontend's expectation of potentially empty data.
		if err.Error() == "no upload result available yet" { // Assuming the service returns a specific error
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			// Return an empty JSON object that includes the expected key with an empty array
			json.NewEncoder(w).Encode(map[string][]interface{}{"OptionSaleDetails": {}})
			return
		}
		// For other errors, return an internal server error
		http.Error(w, fmt.Sprintf("Error retrieving latest results: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return only the OptionSaleDetails as JSON
	// Ensure we return an object with the OptionSaleDetails key, even if the array is nil/empty
	response := map[string]interface{}{
		"OptionSaleDetails": result.OptionSaleDetails,
	}
	if result.OptionSaleDetails == nil {
		response["OptionSaleDetails"] = []interface{}{} // Ensure it's an empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Error generating JSON response for option sales", http.StatusInternalServerError)
	}
}

// parseUploadedFile function is removed as its logic is now handled by the service layer.
