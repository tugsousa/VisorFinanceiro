// backend/src/handlers/transaction_handler.go
package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

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

// DeleteRequest define a estrutura para o corpo do pedido de eliminação.
type DeleteRequest struct {
	Type   string   `json:"type"`
	Values []string `json:"values"`
}

// HandleDeleteAllProcessedTransactions foi atualizado para HandleDeleteTransactions para maior clareza.
// Lida com a eliminação de transações com base nos critérios fornecidos ('all', 'source', 'year').
func (h *TransactionHandler) HandleDeleteAllProcessedTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	var req DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	logger.L.Info("Handling DeleteTransactions request", "userID", userID, "type", req.Type, "values", req.Values)

	txDB, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Failed to begin transaction for data deletion", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to delete data", http.StatusInternalServerError)
		return
	}
	defer func() {
		if p := recover(); p != nil {
			txDB.Rollback()
			panic(p)
		} else if err != nil {
			txDB.Rollback()
		}
	}()

	var result sql.Result
	switch req.Type {
	case "all":
		result, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ?", userID)
	case "source":
		if len(req.Values) == 0 {
			err = fmt.Errorf("source values cannot be empty for type 'source'")
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		query := "DELETE FROM processed_transactions WHERE user_id = ? AND source IN (?" + strings.Repeat(",?", len(req.Values)-1) + ")"
		args := make([]interface{}, len(req.Values)+1)
		args[0] = userID
		for i, v := range req.Values {
			args[i+1] = v
		}
		result, err = txDB.Exec(query, args...)
	case "year":
		if len(req.Values) != 1 {
			err = fmt.Errorf("exactly one year value is required for type 'year'")
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		// Assumindo que o formato da data na BD é 'DD-MM-YYYY'
		result, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ? AND SUBSTR(date, 7, 4) = ?", userID, req.Values[0])
	default:
		err = fmt.Errorf("invalid deletion type specified")
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err != nil {
		logger.L.Error("Error executing delete statement", "userID", userID, "type", req.Type, "error", err)
		utils.SendJSONError(w, "Failed to delete transactions", http.StatusInternalServerError)
		return
	}

	// Recalcula o upload_count com base nas fontes distintas restantes
	var newUploadCount int
	err = txDB.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ?", userID).Scan(&newUploadCount)
	if err != nil {
		logger.L.Error("Failed to recount distinct sources for user", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to update user metadata", http.StatusInternalServerError)
		return
	}

	_, err = txDB.Exec("UPDATE users SET upload_count = ? WHERE id = ?", newUploadCount, userID)
	if err != nil {
		logger.L.Error("Failed to update upload count for user", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to update upload count", http.StatusInternalServerError)
		return
	}

	if err = txDB.Commit(); err != nil {
		logger.L.Error("Failed to commit transaction for data deletion", "userID", userID, "error", err)
		utils.SendJSONError(w, "Failed to finalize data deletion", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	logger.L.Info("Successfully deleted transactions and updated upload count", "userID", userID, "type", req.Type, "rowsAffected", rowsAffected, "newUploadCount", newUploadCount)

	h.uploadService.InvalidateUserCache(userID)
	logger.L.Info("User cache invalidated after deleting transactions", "userID", userID)

	w.WriteHeader(http.StatusNoContent)
}
