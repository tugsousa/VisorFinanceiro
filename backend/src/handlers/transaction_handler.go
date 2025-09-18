// backend/src/handlers/transaction_handler.go
package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security/validation" // Import validation
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

// NOTE: I am now reverting HandleGetProcessedTransactions back to its original, simpler form,
// as the root cause of NULLs is being fixed at the point of entry.
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

type DeleteRequest struct {
	Type   string   `json:"type"`
	Values []string `json:"values"`
}

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

// ManualTransactionRequest is updated with all new fields
type ManualTransactionRequest struct {
	Date               string  `json:"date"`
	Source             string  `json:"source"`
	ProductName        string  `json:"product_name"`
	ISIN               string  `json:"isin"`
	TransactionType    string  `json:"transaction_type"`
	TransactionSubType string  `json:"transaction_subtype"`
	BuySell            string  `json:"buy_sell"`
	Quantity           float64 `json:"quantity"`
	Price              float64 `json:"price"`
	Commission         float64 `json:"commission"`
	Currency           string  `json:"currency"`
	OrderID            string  `json:"order_id"`
}

func (h *TransactionHandler) HandleAddManualTransaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "Autenticação necessária.", http.StatusUnauthorized)
		return
	}

	var req ManualTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendJSONError(w, "Pedido inválido.", http.StatusBadRequest)
		return
	}

	// --- START: Detailed Validation ---
	if err := validation.ValidateStringNotEmpty(req.Date, "Data"); err != nil {
		utils.SendJSONError(w, "O campo 'Data' é obrigatório.", http.StatusBadRequest)
		return
	}
	transactionDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		utils.SendJSONError(w, "Formato de data inválido. Use AAAA-MM-DD.", http.StatusBadRequest)
		return
	}

	if err := validation.ValidateStringNotEmpty(req.Source, "Origem"); err != nil {
		utils.SendJSONError(w, "O campo 'Origem' é obrigatório.", http.StatusBadRequest)
		return
	}
	if err := validation.ValidateAlphanumericWithSpaces(req.Source, "Origem"); err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validation.ValidateStringNotEmpty(req.ProductName, "Nome do Produto"); err != nil {
		utils.SendJSONError(w, "O campo 'Nome do Produto' é obrigatório.", http.StatusBadRequest)
		return
	}
	if err := validation.ValidateAlphanumericWithSpaces(req.ProductName, "Nome do Produto"); err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validation.ValidateStringNotEmpty(req.ISIN, "ISIN"); err != nil {
		utils.SendJSONError(w, "O campo 'ISIN' é obrigatório.", http.StatusBadRequest)
		return
	}
	if err := validation.ValidateAlphanumericWithSpaces(req.ISIN, "ISIN"); err != nil { // Basic check, can be stricter
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate required numeric fields
	if req.Quantity <= 0 {
		utils.SendJSONError(w, "A 'Quantidade' deve ser um número positivo.", http.StatusBadRequest)
		return
	}
	if req.Price <= 0 {
		utils.SendJSONError(w, "O 'Preço' deve ser um número positivo.", http.StatusBadRequest)
		return
	}
	if req.Commission < 0 {
		utils.SendJSONError(w, "A 'Comissão' não pode ser negativa.", http.StatusBadRequest)
		return
	}
	// --- END: Detailed Validation ---

	exchangeRate, err := processors.GetExchangeRate(req.Currency, transactionDate)
	if err != nil {
		logger.L.Warn("Could not get exchange rate for manual transaction", "error", err)
		exchangeRate = 1.0 // Fallback to 1.0 if API fails
	}

	amount := req.Quantity * req.Price
	if req.BuySell == "BUY" {
		amount = -amount
	}

	amountEUR := amount
	if req.Currency != "EUR" && exchangeRate != 0 {
		amountEUR = amount / exchangeRate
	}

	countryCode := utils.GetCountryCodeString(req.ISIN)

	description := fmt.Sprintf("Manual Entry: %s %f %s @ %f %s", req.BuySell, req.Quantity, req.ProductName, req.Price, req.Currency)

	hashInput := fmt.Sprintf("%s-%s", description, time.Now().String())
	hash := sha256.Sum256([]byte(hashInput))
	hashId := hex.EncodeToString(hash[:])

	stmt, err := database.DB.Prepare(`
        INSERT INTO processed_transactions 
        (user_id, date, source, product_name, isin, quantity, original_quantity, price, 
        transaction_type, transaction_subtype, buy_sell, description, amount, currency, 
        commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
	if err != nil {
		logger.L.Error("Failed to prepare statement for manual transaction", "error", err)
		utils.SendJSONError(w, "Falha ao guardar a transação.", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(
		userID,
		transactionDate.Format("02-01-2006"),
		req.Source,
		req.ProductName,
		req.ISIN,
		int(req.Quantity),
		int(req.Quantity),
		req.Price,
		req.TransactionType,
		req.TransactionSubType,
		req.BuySell,
		description,
		amount,
		req.Currency,
		req.Commission,
		req.OrderID,
		exchangeRate,
		amountEUR,
		countryCode,
		description,
		hashId,
	)

	if err != nil {
		logger.L.Error("Failed to insert manual transaction", "userID", userID, "error", err)
		utils.SendJSONError(w, "Falha ao guardar a transação.", http.StatusInternalServerError)
		return
	}

	h.uploadService.InvalidateUserCache(userID)
	logger.L.Info("Manual transaction added and cache invalidated", "userID", userID)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Transação adicionada com sucesso"})
}
