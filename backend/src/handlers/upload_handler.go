package handlers

import (
	"TAXFOLIO/src/models"
	"TAXFOLIO/src/parsers"
	"TAXFOLIO/src/processors"
	"encoding/json"
	"fmt"
	"net/http"
)

// UploadHandler handles file uploads and CSV parsing.
type UploadHandler struct{}

func NewUploadHandler() *UploadHandler {
	return &UploadHandler{}
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	// Parse the uploaded file
	rawTransactions, err := h.parseUploadedFile(r)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error parsing uploaded file: %v", err), http.StatusBadRequest)
		return
	}

	// Process RawTransaction into ProcessedTransaction
	processedTransactions, err := parsers.ParseProcessedTransactions(rawTransactions)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error processing transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// Calculate dividends
	dividendResult := processors.CalculateDividends(processedTransactions)

	// Process stock transactions
	stockProcessor := processors.NewStockProcessor()
	// Use the new variable names matching the processor's return values
	stockSaleDetails, stockHoldings := stockProcessor.ProcessTransactions(processedTransactions)

	// Process option transactions
	optionProcessor := processors.NewOptionProcessor()
	optionSaleDetails, optionHoldings := optionProcessor.ProcessTransactions(processedTransactions)

	// Prepare response using the new field names
	response := map[string]interface{}{
		"dividendResult":    dividendResult,
		"stockSaleDetails":  stockSaleDetails, // Renamed key
		"stockHoldings":     stockHoldings,    // Renamed key
		"optionSaleDetails": optionSaleDetails,
		"optionHoldings":    optionHoldings,
		// ... other data you want to return
	}
	// Return the processed transactions as JSON
	w.Header().Set("Content-Type", "application/json")
	//if err := json.NewEncoder(w).Encode(rawTransactions); err != nil {
	//if err := json.NewEncoder(w).Encode(processedTransactions); err != nil {
	//if err := json.NewEncoder(w).Encode(dividendResult); err != nil {
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

func (h *UploadHandler) parseUploadedFile(r *http.Request) ([]models.RawTransaction, error) {
	// Parse multipart form (max 10 MB file size)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		return nil, fmt.Errorf("failed to parse multipart form: %w", err)
	}

	// Get the file from the request
	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve file from request: %w", err)
	}
	defer file.Close()

	// Parse the CSV file
	transactions, err := parsers.ParseCSV(file)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV file: %w", err)
	}

	return transactions, nil
}
