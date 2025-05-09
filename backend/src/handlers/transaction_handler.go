package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/database" // Direct DB access for this handler
	"github.com/username/taxfolio/backend/src/models"
	// "github.com/username/taxfolio/backend/src/services" // Not using service for this specific handler as per original
)

type TransactionHandler struct {
	// No service needed if it accesses DB directly, or could take a service
}

func NewTransactionHandler() *TransactionHandler {
	return &TransactionHandler{}
}

// HandleGetProcessedTransactions retrieves ALL historical processed transactions for the authenticated user
func (h *TransactionHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetProcessedTransactions for userID: %d", userID)

	rows, err := database.DB.Query(`
		SELECT date, product_name, isin, quantity, original_quantity, price, order_type, 
		transaction_type, description, amount, currency, commission, order_id, 
		exchange_rate, amount_eur, country_code 
		FROM processed_transactions 
		WHERE user_id = ?
		ORDER BY date DESC`, userID)

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
