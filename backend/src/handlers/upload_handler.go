// backend/src/handlers/upload_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	// "github.com/username/taxfolio/backend/src/database" // No longer needed directly here for most handlers
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
)

// UploadHandler struct and NewUploadHandler constructor remain the same.
type UploadHandler struct {
	uploadService services.UploadService
}

func NewUploadHandler(service services.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: service,
	}
}

// HandleUpload receives the file, passes it to the service, and returns the result
// of processing *that specific file*.
func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB max file size
		sendJSONError(w, fmt.Sprintf("failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		sendJSONError(w, fmt.Sprintf("failed to retrieve file from request: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	if fileHeader.Header.Get("Content-Type") != "text/csv" { // Basic validation
		sendJSONError(w, "only CSV files are allowed", http.StatusBadRequest)
		return
	}
	if fileHeader.Size > 10<<20 {
		sendJSONError(w, "file too large", http.StatusBadRequest)
		return
	}

	log.Printf("Handling upload for userID: %d, filename: %s", userID, fileHeader.Filename)
	result, err := h.uploadService.ProcessUpload(file, userID) // Service now handles DB storage
	if err != nil {
		log.Printf("Error processing upload for userID %d: %v", userID, err)
		sendJSONError(w, fmt.Sprintf("Error processing upload: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil { // Result is from the current upload
		log.Printf("Error generating JSON response for upload result userID %d: %v", userID, err)
		// Don't use sendJSONError here as we might have already written headers
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

// HandleGetStockSales retrieves ALL historical stock sale details for the authenticated user.
func (h *UploadHandler) HandleGetStockSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockSales for userID: %d", userID)
	stockSales, err := h.uploadService.GetStockSaleDetails(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving stock sales for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if stockSales == nil { // Ensure empty array, not null, if no sales
		stockSales = []models.SaleDetail{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stockSales) // Frontend expects a direct array
}

// HandleGetOptionSales retrieves ALL historical option sale details for the authenticated user.
func (h *UploadHandler) HandleGetOptionSales(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionSales for userID: %d", userID)
	optionSales, err := h.uploadService.GetOptionSaleDetails(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving option sales for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	// Frontend OptionPage.js and TaxPage.js expect { OptionSaleDetails: [...] }
	response := map[string]interface{}{"OptionSaleDetails": optionSales}
	if optionSales == nil { // Ensure empty array if optionSales is nil
		response["OptionSaleDetails"] = []models.OptionSaleDetail{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetDividendTaxSummary retrieves the dividend tax summary based on ALL historical data for the user.
func (h *UploadHandler) HandleGetDividendTaxSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetDividendTaxSummary for userID: %d", userID)
	taxSummary, err := h.uploadService.GetDividendTaxSummary(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend tax summary for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if taxSummary == nil { // Ensure empty map, not null
		taxSummary = make(models.DividendTaxResult)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(taxSummary)
}

// Helper function to send JSON errors
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	// It's good practice to log the error server-side as well
	log.Printf("Sending JSON error to client: %s (status: %d)", message, statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// HandleGetDividendTransactions retrieves the list of ALL historical individual dividend transactions for the user.
func (h *UploadHandler) HandleGetDividendTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetDividendTransactions for userID: %d", userID)
	dividendTransactions, err := h.uploadService.GetDividendTransactions(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving dividend transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if dividendTransactions == nil { // Ensure empty array, not null
		dividendTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dividendTransactions)
}

// HandleGetRawTransactions is deprecated/problematic for user-specific data without storing raw CSVs.
// This handler will now likely not be used or needs to be re-thought if raw data per user is a requirement.
// For now, it's removed as the service layer doesn't support user-specific raw transactions.
/*
func (h *UploadHandler) HandleGetRawTransactions(w http.ResponseWriter, r *http.Request) {
	// This would require fetching raw data associated with a user, which is not currently implemented.
	sendJSONError(w, "Fetching raw transactions per user is not supported.", http.StatusNotImplemented)
}
*/

// HandleGetProcessedTransactions retrieves ALL historical processed transactions for the authenticated user
// This function queries the DB directly. It's kept as is because its logic is already user-specific.
func (h *UploadHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetProcessedTransactions for userID: %d", userID)

	// Query the database directly for the user's processed transactions
	// Note: The service layer also has fetchUserProcessedTransactions, consider unifying if needed.
	// However, this handler is fine as is for its purpose.
	rows, err := database.DB.Query(`
		SELECT date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date DESC`, userID) // Frontend UploadPage might expect DESC for recent first

	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error querying transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var processedTransactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if scanErr != nil {
			sendJSONError(w, fmt.Sprintf("Error scanning transaction for userID %d: %v", userID, scanErr), http.StatusInternalServerError)
			return
		}
		processedTransactions = append(processedTransactions, tx)
	}
	if err = rows.Err(); err != nil {
		sendJSONError(w, fmt.Sprintf("Error iterating over transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if processedTransactions == nil {
		processedTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(processedTransactions); err != nil {
		log.Printf("Error generating JSON response for processed transactions userID %d: %v", userID, err)
		http.Error(w, "Error generating JSON response", http.StatusInternalServerError)
	}
}

// HandleGetStockHoldings retrieves current stock holdings based on ALL historical data for the user.
func (h *UploadHandler) HandleGetStockHoldings(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetStockHoldings for userID: %d", userID)
	stockHoldings, err := h.uploadService.GetStockHoldings(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving stock holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if stockHoldings == nil {
		stockHoldings = []models.PurchaseLot{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stockHoldings)
}

// HandleGetOptionHoldings retrieves current option holdings based on ALL historical data for the user.
func (h *UploadHandler) HandleGetOptionHoldings(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(int64)
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetOptionHoldings for userID: %d", userID)
	optionHoldings, err := h.uploadService.GetOptionHoldings(userID)
	if err != nil {
		sendJSONError(w, fmt.Sprintf("Error retrieving option holdings for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	if optionHoldings == nil {
		optionHoldings = []models.OptionHolding{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(optionHoldings)
}
