package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
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
	// 0. Authentication - get user ID from JWT
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// 1. Parse multipart form to get the file (max 10 MB file size)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, fmt.Sprintf("failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}

	// 1.5 Input validation - check file type and size
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		http.Error(w, "no file uploaded", http.StatusBadRequest)
		return
	}

	// 2. Get the file from the request with additional validation
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to retrieve file from request: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file type (only allow CSV files)
	if fileHeader.Header.Get("Content-Type") != "text/csv" {
		http.Error(w, "only CSV files are allowed", http.StatusBadRequest)
		return
	}

	// Validate file size (additional check)
	if fileHeader.Size > 10<<20 { // 10 MB
		http.Error(w, "file too large", http.StatusBadRequest)
		return
	}

	// 3. Delegate processing to the UploadService with userID
	result, err := h.uploadService.ProcessUpload(file, userID)
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
	userID := r.Context().Value("userID").(int64)
	result, err := h.uploadService.GetLatestUploadResult(userID)
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
	userID := r.Context().Value("userID").(int64)
	result, err := h.uploadService.GetLatestUploadResult(userID)
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
	// Explicitly handle type conversion
	transactions, err := h.uploadService.GetDividendTransactions()
	var dividendTransactions []models.ProcessedTransaction
	if transactions != nil {
		dividendTransactions = make([]models.ProcessedTransaction, len(transactions))
		for i, tx := range transactions {
			dividendTransactions[i] = models.ProcessedTransaction(tx)
		}
	}

	if err != nil {
		// Handle potential errors, e.g., if no data is available yet
		if err.Error() == "no upload processed yet, cannot retrieve dividend transactions" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // OK status, but empty data
			// Return an empty JSON array
			json.NewEncoder(w).Encode([]models.ProcessedTransaction{})
			return
		}
		// For other errors, return a JSON error response
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Return the transactions as JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(dividendTransactions); err != nil {
		// Handle JSON encoding error by sending a JSON error response
		sendJSONError(w, "Error generating JSON response for dividend transactions", http.StatusInternalServerError)
	}
}

// HandleGetRawTransactions retrieves the list of raw transactions from the latest upload.
func (h *UploadHandler) HandleGetRawTransactions(w http.ResponseWriter, r *http.Request) {
	// 1. Get the raw transactions from the service
	// Explicit type conversion to handle potential package visibility issues
	transactions, err := h.uploadService.GetRawTransactions()
	var rawTransactions []models.RawTransaction
	if transactions != nil {
		rawTransactions = make([]models.RawTransaction, len(transactions))
		for i, tx := range transactions {
			rawTransactions[i] = models.RawTransaction{
				OrderDate:    tx.OrderDate,
				OrderTime:    tx.OrderTime,
				ValueDate:    tx.ValueDate,
				Name:         tx.Name,
				ISIN:         tx.ISIN,
				Description:  tx.Description,
				ExchangeRate: tx.ExchangeRate,
				Currency:     tx.Currency,
				Amount:       tx.Amount,
				OrderID:      tx.OrderID,
			}
		}
	}
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

// HandleGetProcessedTransactions retrieves the list of all processed transactions for the authenticated user.
func (h *UploadHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	// Get user ID from context (set by AuthMiddleware)
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Query the database directly for the user's processed transactions
	rows, err := database.DB.Query(`
		SELECT date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date DESC`, userID)

	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error querying transactions: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var processedTransactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		err := rows.Scan(
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if err != nil {
			sendJSONError(w, fmt.Sprintf("Error scanning transaction: %v", err), http.StatusInternalServerError)
			return
		}
		processedTransactions = append(processedTransactions, tx)
	}

	// Check for errors from iterating over rows
	if err = rows.Err(); err != nil {
		sendJSONError(w, fmt.Sprintf("Error iterating over transactions: %v", err), http.StatusInternalServerError)
		return
	}

	// Return empty array if no transactions found
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
	// Explicit type conversion for stock holdings
	holdings, err := h.uploadService.GetStockHoldings()
	var stockHoldings []models.PurchaseLot
	if holdings != nil {
		stockHoldings = make([]models.PurchaseLot, len(holdings))
		for i, h := range holdings {
			stockHoldings[i] = models.PurchaseLot{
				BuyDate:      h.BuyDate,
				ProductName:  h.ProductName,
				ISIN:         h.ISIN,
				Quantity:     h.Quantity,
				BuyPrice:     h.BuyPrice,
				BuyAmount:    h.BuyAmount,
				BuyCurrency:  h.BuyCurrency,
				BuyAmountEUR: h.BuyAmountEUR,
			}
		}
	}

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
	// Explicit type conversion for option holdings
	holdings, err := h.uploadService.GetOptionHoldings()
	var optionHoldings []models.OptionHolding
	if holdings != nil {
		optionHoldings = make([]models.OptionHolding, len(holdings))
		for i, h := range holdings {
			optionHoldings[i] = models.OptionHolding{
				OpenDate:      h.OpenDate,
				ProductName:   h.ProductName,
				Quantity:      h.Quantity,
				OpenPrice:     h.OpenPrice,
				OpenAmount:    h.OpenAmount,
				OpenCurrency:  h.OpenCurrency,
				OpenAmountEUR: h.OpenAmountEUR,
				OpenOrderID:   h.OpenOrderID,
			}
		}
	}

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
