package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type TransactionHandler struct {
	uploadService services.UploadService
}

func NewTransactionHandler(uploadService services.UploadService) *TransactionHandler {
	return &TransactionHandler{
		uploadService: uploadService,
	}
}

func (h *TransactionHandler) HandleGetProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	log.Printf("Handling GetProcessedTransactions for userID: %d", userID)

	rows, err := database.DB.Query(`
		SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
		       transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, 
		       order_id, exchange_rate, amount_eur, country_code, input_string, hash_id
		FROM processed_transactions
		WHERE user_id = ?
		ORDER BY date DESC, id DESC`, userID)

	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error querying transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var processedTransactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId)
		if scanErr != nil {
			utils.SendJSONError(w, fmt.Sprintf("Error scanning transaction for userID %d: %v", userID, scanErr), http.StatusInternalServerError)
			return
		}
		processedTransactions = append(processedTransactions, tx)
	}
	if err = rows.Err(); err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error iterating over transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
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

func (h *TransactionHandler) HandleDeleteAllProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required or user ID not found in context", http.StatusUnauthorized)
		return
	}
	logger.L.Info("Handling DeleteAllProcessedTransactions", "userID", userID)

	result, err := database.DB.Exec("DELETE FROM processed_transactions WHERE user_id = ?", userID)
	if err != nil {
		logger.L.Error("Error deleting all processed transactions from DB", "userID", userID, "error", err)
		utils.SendJSONError(w, fmt.Sprintf("Error deleting transactions for userID %d: %v", userID, err), http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		logger.L.Error("Error getting rows affected after deleting all transactions", "userID", userID, "error", err)
	} else {
		logger.L.Info("Successfully deleted all processed transactions", "userID", userID, "rowsAffected", rowsAffected)
	}

	h.uploadService.InvalidateUserCache(userID)
	logger.L.Info("User cache invalidated after deleting all transactions", "userID", userID)

	w.WriteHeader(http.StatusNoContent)
}
