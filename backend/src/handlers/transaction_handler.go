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
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/security/validation"
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
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}

	portfolioIDStr := r.URL.Query().Get("portfolio_id")
	if portfolioIDStr == "" {
		utils.SendJSONError(w, "portfolio_id is required", http.StatusBadRequest)
		return
	}
	portfolioID, err := strconv.ParseInt(portfolioIDStr, 10, 64)
	if err != nil {
		utils.SendJSONError(w, "Invalid portfolio_id", http.StatusBadRequest)
		return
	}

	log.Printf("Handling GetProcessedTransactions for userID: %d, portfolioID: %d", userID, portfolioID)

	rows, err := database.DB.Query(`
		SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
		       transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, 
		       order_id, exchange_rate, amount_eur, country_code, input_string, hash_id,
		       cash_balance, balance_currency
		FROM processed_transactions
		WHERE user_id = ? AND portfolio_id = ?
		ORDER BY date DESC, id DESC`, userID, portfolioID)

	if err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error querying transactions: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var processedTransactions []models.ProcessedTransaction
	for rows.Next() {
		var tx models.ProcessedTransaction
		scanErr := rows.Scan(
			&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
			&tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency,
			&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId,
			&tx.CashBalance, &tx.BalanceCurrency)
		if scanErr != nil {
			utils.SendJSONError(w, fmt.Sprintf("Error scanning transaction: %v", scanErr), http.StatusInternalServerError)
			return
		}
		processedTransactions = append(processedTransactions, tx)
	}
	if err = rows.Err(); err != nil {
		utils.SendJSONError(w, fmt.Sprintf("Error iterating transactions: %v", err), http.StatusInternalServerError)
		return
	}
	if processedTransactions == nil {
		processedTransactions = []models.ProcessedTransaction{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(processedTransactions)
}

type DeleteRequest struct {
	PortfolioID int64    `json:"portfolio_id"`
	Type        string   `json:"type"`
	Values      []string `json:"values"`
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

	if req.PortfolioID == 0 {
		utils.SendJSONError(w, "portfolio_id is required", http.StatusBadRequest)
		return
	}

	var exists int
	err := database.DB.QueryRow("SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?", req.PortfolioID, userID).Scan(&exists)
	if err != nil {
		utils.SendJSONError(w, "Invalid or unauthorized portfolio_id", http.StatusForbidden)
		return
	}

	logger.L.Info("Handling DeleteTransactions request", "userID", userID, "portfolioID", req.PortfolioID, "type", req.Type)

	txDB, err := database.DB.Begin()
	if err != nil {
		logger.L.Error("Failed to begin transaction for deletion", "error", err)
		utils.SendJSONError(w, "Failed to delete data", http.StatusInternalServerError)
		return
	}
	defer txDB.Rollback()

	var result sql.Result
	switch req.Type {
	case "all":
		result, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ? AND portfolio_id = ?", userID, req.PortfolioID)
		if err != nil {
			break
		}
		_, err = txDB.Exec("DELETE FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ?", userID, req.PortfolioID)
		if err != nil {
			break
		}
		_, err = txDB.Exec("DELETE FROM uploads_history WHERE user_id = ? AND portfolio_id = ?", userID, req.PortfolioID)

	case "source":
		if len(req.Values) == 0 {
			err = fmt.Errorf("source values cannot be empty")
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		query := "DELETE FROM processed_transactions WHERE user_id = ? AND portfolio_id = ? AND source IN (?" + strings.Repeat(",?", len(req.Values)-1) + ")"
		args := make([]interface{}, len(req.Values)+2)
		args[0] = userID
		args[1] = req.PortfolioID
		for i, v := range req.Values {
			args[i+2] = v
		}
		result, err = txDB.Exec(query, args...)

		if err == nil {
			_, err = txDB.Exec("DELETE FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ?", userID, req.PortfolioID)
		}

	case "year":
		if len(req.Values) != 1 {
			err = fmt.Errorf("exactly one year value is required")
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		result, err = txDB.Exec("DELETE FROM processed_transactions WHERE user_id = ? AND portfolio_id = ? AND SUBSTR(date, 7, 4) = ?", userID, req.PortfolioID, req.Values[0])

		if err == nil {
			_, err = txDB.Exec("DELETE FROM portfolio_snapshots WHERE user_id = ? AND portfolio_id = ?", userID, req.PortfolioID)
		}

	default:
		err = fmt.Errorf("invalid deletion type")
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err != nil {
		logger.L.Error("Error executing delete", "error", err)
		utils.SendJSONError(w, "Failed to delete transactions", http.StatusInternalServerError)
		return
	}

	var newGlobalUploadCount int
	err = txDB.QueryRow("SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = ?", userID).Scan(&newGlobalUploadCount)
	if err == nil {
		_, _ = txDB.Exec("UPDATE users SET upload_count = ? WHERE id = ?", newGlobalUploadCount, userID)
	}

	if err = txDB.Commit(); err != nil {
		logger.L.Error("Failed to commit deletion", "error", err)
		utils.SendJSONError(w, "Failed to finalize deletion", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	logger.L.Info("Successfully deleted transactions", "rows", rowsAffected)

	h.uploadService.InvalidateUserCache(userID, req.PortfolioID)
	w.WriteHeader(http.StatusNoContent)
}

type ManualTransactionRequest struct {
	PortfolioID        int64   `json:"portfolio_id"`
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

	if req.PortfolioID == 0 {
		utils.SendJSONError(w, "Portfolio ID obrigatório.", http.StatusBadRequest)
		return
	}

	var exists int
	err := database.DB.QueryRow("SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?", req.PortfolioID, userID).Scan(&exists)
	if err != nil {
		utils.SendJSONError(w, "Portfolio inválido ou não autorizado.", http.StatusForbidden)
		return
	}

	req.Source = validation.SanitizeText(validation.StripUnprintable(req.Source))
	req.ProductName = validation.SanitizeText(validation.StripUnprintable(req.ProductName))
	req.ISIN = validation.SanitizeText(validation.StripUnprintable(req.ISIN))

	if err := validation.ValidateStringNotEmpty(req.Date, "Data"); err != nil {
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	transactionDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		utils.SendJSONError(w, "Formato de data inválido. Use AAAA-MM-DD.", http.StatusBadRequest)
		return
	}

	if req.Quantity <= 0 {
		utils.SendJSONError(w, "A 'Quantidade' deve ser positiva.", http.StatusBadRequest)
		return
	}
	if req.Price < 0 {
		utils.SendJSONError(w, "O 'Preço' não pode ser negativo.", http.StatusBadRequest)
		return
	}

	exchangeRate, err := processors.GetExchangeRate(req.Currency, transactionDate)
	if err != nil {
		logger.L.Warn("Manual TX: Could not get exchange rate", "error", err)
		exchangeRate = 1.0
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
	sanitizedDescription := validation.SanitizeText(validation.SanitizeForFormulaInjection(description))

	hashInput := fmt.Sprintf("%s-%s-%d", description, time.Now().String(), req.PortfolioID)
	hash := sha256.Sum256([]byte(hashInput))
	hashId := hex.EncodeToString(hash[:])

	stmt, err := database.DB.Prepare(`
        INSERT INTO processed_transactions 
        (user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity, price, 
        transaction_type, transaction_subtype, buy_sell, description, amount, currency, 
        commission, order_id, exchange_rate, amount_eur, country_code, input_string, hash_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
	if err != nil {
		logger.L.Error("Failed to prepare statement", "error", err)
		utils.SendJSONError(w, "Falha ao preparar inserção.", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(
		userID,
		req.PortfolioID,
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
		sanitizedDescription,
		amount,
		req.Currency,
		req.Commission,
		req.OrderID,
		exchangeRate,
		amountEUR,
		countryCode,
		sanitizedDescription,
		hashId,
	)

	if err != nil {
		logger.L.Error("Failed to insert manual transaction", "error", err)
		utils.SendJSONError(w, "Falha ao guardar a transação.", http.StatusInternalServerError)
		return
	}

	h.uploadService.InvalidateUserCache(userID, req.PortfolioID)
	logger.L.Info("Manual transaction added", "userID", userID, "portfolioID", req.PortfolioID)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Transação adicionada com sucesso"})
}
