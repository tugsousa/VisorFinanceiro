package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

type manualTxServiceStub struct {
	services.UploadService
	jobs    *services.JobManager
	rebuilt chan string
}

func (s manualTxServiceStub) InvalidateUserCache(int64, int64) {}
func (s manualTxServiceStub) GetJobManager() *services.JobManager { return s.jobs }
func (s manualTxServiceStub) RebuildUserHistoryFrom(_ int64, _ int64, fromDate string) error {
	s.rebuilt <- fromDate
	return nil
}

// setupManualTxTest uses the real migrations, so that it tests the columns the handler actually writes to.
func setupManualTxTest(t *testing.T) (*TransactionHandler, manualTxServiceStub) {
	t.Helper()
	logger.InitLogger("error")

	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	if err := os.Chdir(filepath.Join(workingDir, "..", "..")); err != nil {
		t.Fatalf("failed to change directory: %v", err)
	}
	t.Cleanup(func() { os.Chdir(workingDir) })

	if err := utils.InitCountryData("data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}

	previous := database.DB
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB = previous
	})

	_, err = database.DB.Exec(`
		INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at)
			VALUES (1, 'user', 'user@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
		INSERT INTO portfolios (id, user_id, name) VALUES (1, 1, 'Portfolio');`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	stub := manualTxServiceStub{jobs: services.NewJobManager(), rebuilt: make(chan string, 10)}
	return NewTransactionHandler(stub), stub
}

func manualTxBody(overrides map[string]interface{}) map[string]interface{} {
	body := map[string]interface{}{
		"portfolio_id": 1, "date": "2025-03-10", "source": "Manual", "product_name": "ACME", "isin": "US0378331005",
		"transaction_type": "STOCK", "transaction_subtype": "", "buy_sell": "BUY",
		"quantity": 2.5, "price": 10.0, "commission": 1.0, "currency": "EUR", "order_id": "",
	}
	for key, value := range overrides {
		body[key] = value
	}
	return body
}

func postManualTx(t *testing.T, handler *TransactionHandler, body map[string]interface{}) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("invalid test data: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/transactions/manual", bytes.NewReader(encoded))
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.HandleAddManualTransaction(recorder, request)
	return recorder
}

func fetchTxs(t *testing.T, handler *TransactionHandler) []models.ProcessedTransaction {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/transactions/processed?portfolio_id=1", nil)
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.HandleGetProcessedTransactions(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("reading transactions failed with %d: %s", recorder.Code, recorder.Body.String())
	}
	var txs []models.ProcessedTransaction
	if err := json.Unmarshal(recorder.Body.Bytes(), &txs); err != nil {
		t.Fatalf("invalid response: %v", err)
	}
	return txs
}

func TestManualTransaction_CanBeReadBack(t *testing.T) {
	handler, stub := setupManualTxTest(t)

	if recorder := postManualTx(t, handler, manualTxBody(nil)); recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recorder.Code, recorder.Body.String())
	}

	txs := fetchTxs(t, handler)
	if len(txs) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(txs))
	}
	if txs[0].Commission != 1 {
		t.Errorf("expected the commission to be stored in EUR, got %v", txs[0].Commission)
	}
	if txs[0].Quantity != 2.5 {
		t.Errorf("expected the fractional quantity to be kept, got %v", txs[0].Quantity)
	}

	select {
	case fromDate := <-stub.rebuilt:
		if fromDate != "10-03-2025" {
			t.Errorf("expected a history rebuild from the transaction date, got %q", fromDate)
		}
	case <-time.After(5 * time.Second):
		t.Error("expected a history rebuild")
	}
}

func TestManualTransaction_RequiresPortfolio(t *testing.T) {
	handler, _ := setupManualTxTest(t)

	body := manualTxBody(nil)
	delete(body, "portfolio_id")
	if recorder := postManualTx(t, handler, body); recorder.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", recorder.Code)
	}
}

func TestManualTransactionAmount(t *testing.T) {
	tests := []struct {
		name    string
		txType  string
		subType string
		buySell string
		want    float64
	}{
		{"stock purchase", "STOCK", "", "BUY", -100},
		{"stock sale", "STOCK", "", "SELL", 100},
		{"option sale", "OPTION", "CALL", "SELL", 100},
		{"dividend ignores the form's direction", "DIVIDEND", "", "BUY", 100},
		{"dividend tax", "DIVIDEND", "TAX", "BUY", -100},
		{"fee", "FEE", "", "SELL", -100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := manualTransactionAmount(ManualTransactionRequest{
				Quantity: 2, Price: 50, TransactionType: tt.txType, TransactionSubType: tt.subType, BuySell: tt.buySell,
			})
			if got != tt.want {
				t.Errorf("expected %v, got %v", tt.want, got)
			}
		})
	}
}
