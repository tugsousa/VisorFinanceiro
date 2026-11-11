package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/services"
)

// noPrices has no market prices, so the tests never go to the internet.
type noPrices struct{ services.PriceService }

func (noPrices) GetCurrentPrices([]string) (map[string]services.PriceInfo, error) {
	return map[string]services.PriceInfo{}, nil
}

// setupAllocationHandlerTest uses the real migrations and service: user 1 owns portfolio 1, user 2
// owns portfolio 2.
func setupAllocationHandlerTest(t *testing.T) *PortfolioHandler {
	t.Helper()
	logger.InitLogger("error")

	previousDB, previousFS := database.DB, database.MigrationsFS
	database.MigrationsFS = os.DirFS(filepath.Join("..", "..", "db", "migrations"))
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB, database.MigrationsFS = previousDB, previousFS
	})

	_, err := database.DB.Exec(`
		INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at) VALUES
			(1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
			(2, 'two', 'two@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
		INSERT INTO portfolios (id, user_id, name) VALUES (1, 1, 'Mine'), (2, 2, 'Other');`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	uploads := services.NewUploadService(
		processors.NewTransactionProcessor(),
		processors.NewDividendProcessor(),
		processors.NewStockProcessor(),
		processors.NewOptionProcessor(),
		processors.NewCashMovementProcessor(),
		processors.NewFeeProcessor(),
		noPrices{},
		cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval),
	)
	return NewPortfolioHandler(uploads, noPrices{})
}

func callAllocation(handler http.HandlerFunc, method, target string, userID int64, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, userID))
	recorder := httptest.NewRecorder()
	handler(recorder, request)
	return recorder
}

func TestAllocationEndpoints_OnlyTheOwnersPortfolio(t *testing.T) {
	h := setupAllocationHandlerTest(t)
	groups := `{"groups":[{"name":"Ações","target_pct":80},{"name":"Obrigações","target_pct":20}]}`

	// The owner can save and read.
	if rec := callAllocation(h.HandleSaveAllocationGroups, http.MethodPut, "/api/allocation/groups?portfolio_id=1", 1, groups); rec.Code != http.StatusOK {
		t.Fatalf("owner saving groups: %d %s", rec.Code, rec.Body.String())
	}
	if rec := callAllocation(h.HandleGetAllocation, http.MethodGet, "/api/allocation?portfolio_id=1", 1, ""); rec.Code != http.StatusOK ||
		!strings.Contains(rec.Body.String(), `"configured":true`) {
		t.Fatalf("owner reading: %d %s", rec.Code, rec.Body.String())
	}

	// Another user gets 404 on every endpoint, and changes nothing.
	others := []struct {
		name    string
		handler http.HandlerFunc
		method  string
		target  string
		body    string
	}{
		{"read", h.HandleGetAllocation, http.MethodGet, "/api/allocation?portfolio_id=1", ""},
		{"groups", h.HandleSaveAllocationGroups, http.MethodPut, "/api/allocation/groups?portfolio_id=1", `{"groups":[{"name":"X","target_pct":100}]}`},
		{"assignments", h.HandleSaveAllocationAssignments, http.MethodPut, "/api/allocation/assignments?portfolio_id=1", `{"assignments":[]}`},
		{"settings", h.HandleSaveAllocationSettings, http.MethodPut, "/api/allocation/settings?portfolio_id=1", `{"tolerance_pp":2}`},
		{"deposit plan", h.HandleAllocationDepositPlan, http.MethodGet, "/api/allocation/deposit-plan?portfolio_id=1&amount=100", ""},
	}
	for _, c := range others {
		if rec := callAllocation(c.handler, c.method, c.target, 2, c.body); rec.Code != http.StatusNotFound {
			t.Errorf("%s by another user: got %d %s, want 404", c.name, rec.Code, rec.Body.String())
		}
	}
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM allocation_groups WHERE portfolio_id = 1 AND name IN ('Ações', 'Obrigações')").Scan(&count)
	if count != 2 {
		t.Errorf("portfolio 1 should still have its 2 groups, has %d", count)
	}
}

func TestAllocationEndpoints_BadInput(t *testing.T) {
	h := setupAllocationHandlerTest(t)
	cases := []struct {
		name    string
		handler http.HandlerFunc
		target  string
		body    string
	}{
		{"no portfolio", h.HandleGetAllocation, "/api/allocation", ""},
		{"targets not 100", h.HandleSaveAllocationGroups, "/api/allocation/groups?portfolio_id=1", `{"groups":[{"name":"A","target_pct":50}]}`},
		{"invalid JSON", h.HandleSaveAllocationGroups, "/api/allocation/groups?portfolio_id=1", `{"groups":`},
		{"tolerance 0", h.HandleSaveAllocationSettings, "/api/allocation/settings?portfolio_id=1", `{"tolerance_pp":0}`},
		{"amount not a number", h.HandleAllocationDepositPlan, "/api/allocation/deposit-plan?portfolio_id=1&amount=abc", ""},
		{"no groups yet", h.HandleAllocationDepositPlan, "/api/allocation/deposit-plan?portfolio_id=1&amount=100", ""},
	}
	for _, c := range cases {
		if rec := callAllocation(c.handler, http.MethodPut, c.target, 1, c.body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d %s, want 400", c.name, rec.Code, rec.Body.String())
		}
	}
}
