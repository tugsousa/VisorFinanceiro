package handlers

import (
	"TAXFOLIO/src/models"
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
			// Return an empty JSON object that includes the expected key with an empty *array*
			json.NewEncoder(w).Encode(map[string][]interface{}{"OptionSaleDetails": []interface{}{}}) // Return empty array
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

// HandleGetDividendTaxSummary retrieves the latest processed dividend tax summary.
func (h *UploadHandler) HandleGetDividendTaxSummary(w http.ResponseWriter, r *http.Request) {
	// 1. Get the dividend tax summary from the service
	taxSummary, err := h.uploadService.GetDividendTaxSummary()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		// Check for the specific error message used in the service
		if err.Error() == "no upload processed yet, cannot generate dividend tax summary" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			// Return an empty JSON object or map
			json.NewEncoder(w).Encode(map[string]interface{}{}) // Return empty map
			return
		}
		// For other errors, return an internal server error
		http.Error(w, fmt.Sprintf("Error retrieving dividend tax summary: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the DividendTaxResult as JSON
	// Ensure we return an empty map if the result is nil (though the service check should prevent this)
	if taxSummary == nil {
		// Use the correct type from the models package
		taxSummary = make(models.DividendTaxResult) // Ensure it's an empty map, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(taxSummary); err != nil {
		http.Error(w, "Error generating JSON response for dividend tax summary", http.StatusInternalServerError)
	}
}

// Helper function to send JSON errors
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// HandleGetDividendTransactions retrieves the list of individual dividend transactions.
func (h *UploadHandler) HandleGetDividendTransactions(w http.ResponseWriter, r *http.Request) {
	// 1. Get the dividend transactions from the service
	dividendTransactions, err := h.uploadService.GetDividendTransactions()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve dividend transactions" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			// Return an empty JSON array
			json.NewEncoder(w).Encode([]models.ProcessedTransaction{}) // Already returns JSON
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the transactions as JSON
	// Ensure we return an empty array if the result is nil
	if dividendTransactions == nil {
		dividendTransactions = []models.ProcessedTransaction{} // Ensure it's an empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(dividendTransactions); err != nil {
		// Handle JSON encoding error by sending a JSON error response
		sendJSONError(w, "Error generating JSON response for dividend transactions", http.StatusInternalServerError)
	}
}

// HandleGetRawTransactions retrieves the list of raw transactions from the latest upload.
func (h *UploadHandler) HandleGetRawTransactions(w http.ResponseWriter, r *http.Request) {
	// 1. Get the raw transactions from the service
	rawTransactions, err := h.uploadService.GetRawTransactions()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve raw transactions" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			json.NewEncoder(w).Encode([]models.RawTransaction{})
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving raw transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the transactions as JSON
	if rawTransactions == nil {
		rawTransactions = []models.RawTransaction{} // Ensure empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(rawTransactions); err != nil {
		sendJSONError(w, "Error generating JSON response for raw transactions", http.StatusInternalServerError)
	}
}

// HandleGetProcessedTransactions retrieves the list of all processed transactions from the latest upload.
func (h *UploadHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	// 1. Get the processed transactions from the service
	processedTransactions, err := h.uploadService.GetProcessedTransactions()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve processed transactions" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			json.NewEncoder(w).Encode([]models.ProcessedTransaction{})
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving processed transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the transactions as JSON
	if processedTransactions == nil {
		processedTransactions = []models.ProcessedTransaction{} // Ensure empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(processedTransactions); err != nil {
		sendJSONError(w, "Error generating JSON response for processed transactions", http.StatusInternalServerError)
	}
}

// HandleGetStockHoldings retrieves the current stock holdings from the latest upload.
func (h *UploadHandler) HandleGetStockHoldings(w http.ResponseWriter, r *http.Request) {
	// 1. Get the stock holdings from the service
	stockHoldings, err := h.uploadService.GetStockHoldings()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve stock holdings" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode([]models.PurchaseLot{})
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving stock holdings: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the holdings as JSON
	if stockHoldings == nil {
		stockHoldings = []models.PurchaseLot{} // Ensure empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stockHoldings); err != nil {
		sendJSONError(w, "Error generating JSON response for stock holdings", http.StatusInternalServerError)
	}
}

// HandleGetOptionHoldings retrieves the current option holdings from the latest upload.
func (h *UploadHandler) HandleGetOptionHoldings(w http.ResponseWriter, r *http.Request) {
	// 1. Get the option holdings from the service
	optionHoldings, err := h.uploadService.GetOptionHoldings()
	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve option holdings" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode([]models.OptionHolding{})
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving option holdings: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the holdings as JSON
	if optionHoldings == nil {
		optionHoldings = []models.OptionHolding{} // Ensure empty array, not null
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(optionHoldings); err != nil {
		sendJSONError(w, "Error generating JSON response for option holdings", http.StatusInternalServerError)
	}
}
