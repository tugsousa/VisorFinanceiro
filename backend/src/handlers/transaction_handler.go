package handlers

import (
	"encoding/json"
	"fmt"
	"log" // Keep log for now as per original structure for this specific handler
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils" // Import utils package
)

type TransactionHandler struct {
}

func NewTransactionHandler() *TransactionHandler {
	return &TransactionHandler{}
}

func (h *TransactionHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context()) // Assumes GetUserIDFromContext is available (defined in user_handler.go or a shared utils)
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized) // Use utils.SendJSONError
		return
	}
	log.Printf("Handling GetProcessedTransactions for userID: %d", userID)

	rows, err := database.DB.Query(`
		SELECT id, date, product_name, isin, quantity, original_quantity, price, order_type,
		transaction_type, description, amount, currency, commission, order_id,
		exchange_rate, amount_eur, country_code
		FROM processed_transactions
		WHERE user_id = ?
		ORDER BY date DESC, id DESC`, userID)

	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error querying transactions for userID %d: %v", userID, err), http.StatusInternalServerError) // Use utils.SendJSONError
		return
	}
	defer rows.Close()

	var processedTransactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID,
			&tx.Date, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.OrderType, &tx.TransactionType, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode)
		if scanErr != nil {
			utils.SendJSONError(w, fmt.Sprintf("Error scanning transaction for userID %d: %v", userID, scanErr), http.StatusInternalServerError) // Use utils.SendJSONError
			return
		}
		processedTransactions = append(processedTransactions, tx)
	}
	if err = rows.Err(); err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error iterating over transactions for userID %d: %v", userID, err), http.StatusInternalServerError) // Use utils.SendJSONError
		return
	}
	if processedTransactions == nil {
		processedTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(processedTransactions); err != nil {
		log.Printf("Error generating JSON response for processed transactions userID %d: %v", userID, err)
	}
}
