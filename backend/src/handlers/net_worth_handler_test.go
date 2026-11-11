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

	"github.com/go-chi/chi/v5"
	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/services"
)

type netWorthPriceStub struct{ services.PriceService }

func (netWorthPriceStub) GetCurrentPrices([]string) (map[string]services.PriceInfo, error) {
	return map[string]services.PriceInfo{}, nil
}

// setupNetWorthTest runs the real migrations, creates users 1 and 2, and returns a router with the net worth
// routes as main.go registers them, signed in as whichever user the request asks for.
func setupNetWorthTest(t *testing.T) http.Handler {
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

	previous := database.DB
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB = previous
	})

	_, err = database.DB.Exec(`
		INSERT INTO users (id, username, email, password, auth_provider, created_at, updated_at) VALUES
			(1, 'one', 'one@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
			(2, 'two', 'two@example.com', 'x', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
		INSERT INTO portfolios (id, user_id, name) VALUES (1, 1, 'One'), (2, 2, 'Two');`)
	if err != nil {
		t.Fatalf("failed to set up data: %v", err)
	}

	service := services.NewUploadService(
		processors.NewTransactionProcessor(), processors.NewDividendProcessor(), processors.NewStockProcessor(),
		processors.NewOptionProcessor(), processors.NewCashMovementProcessor(), processors.NewFeeProcessor(),
		netWorthPriceStub{}, cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval),
	)
	h := NewNetWorthHandler(service)
	r := chi.NewRouter()
	r.Get("/api/net-worth", h.HandleGetNetWorth)
	r.Get("/api/other-assets", h.HandleListOtherAssets)
	r.Post("/api/other-assets", h.HandleCreateOtherAsset)
	r.Put("/api/other-assets/{id}", h.HandleUpdateOtherAsset)
	r.Delete("/api/other-assets/{id}", h.HandleDeleteOtherAsset)
	r.Post("/api/other-assets/{id}/entries", h.HandleAddOtherAssetEntry)
	r.Delete("/api/other-assets/{id}/entries/{entryId}", h.HandleDeleteOtherAssetEntry)
	return r
}

func netWorthRequest(t *testing.T, router http.Handler, userID int64, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("invalid test data: %v", err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	request := httptest.NewRequest(method, path, reader)
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, userID))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func decodeInto(t *testing.T, recorder *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(recorder.Body.Bytes(), target); err != nil {
		t.Fatalf("invalid response %q: %v", recorder.Body.String(), err)
	}
}

func TestOtherAssets_CreateUpdateAndEntries(t *testing.T) {
	router := setupNetWorthTest(t)

	rec := netWorthRequest(t, router, 1, http.MethodPost, "/api/other-assets", map[string]any{
		"type": "cash_account", "name": "Conta à ordem", "initial_value": 1500, "initial_date": "2025-01-10",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var account services.OtherAsset
	decodeInto(t, rec, &account)
	if account.ValueEUR != 1500 || len(account.Entries) != 1 || account.Entries[0].Kind != "valuation" {
		t.Fatalf("unexpected asset %+v", account)
	}

	rec = netWorthRequest(t, router, 1, http.MethodPost, "/api/other-assets/"+itoa(account.ID)+"/entries",
		map[string]any{"date": "2025-02-01", "kind": "withdrawal", "amount": 200, "note": "renda"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	rec = netWorthRequest(t, router, 1, http.MethodPost, "/api/other-assets", map[string]any{
		"type": "term_deposit", "name": "DP 12 meses", "opened_at": "2025-01-01",
		"details": map[string]any{"principal": 10000, "rate_pct": 3, "maturity": "2026-01-01", "capitalisation": "maturity"},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var deposit services.OtherAsset
	decodeInto(t, rec, &deposit)
	// Matured on 1 January 2026: 300 € gross interest, 216 € after the 28% withholding.
	if deposit.ValueEUR != 10216 || deposit.GrossValueEUR != 10300 || !deposit.Matured {
		t.Errorf("unexpected deposit value %+v", deposit)
	}

	// A term deposit's value comes from its details, not from entries.
	rec = netWorthRequest(t, router, 1, http.MethodPost, "/api/other-assets/"+itoa(deposit.ID)+"/entries",
		map[string]any{"date": "2025-02-01", "kind": "valuation", "amount": 1})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an entry on a term deposit, got %d", rec.Code)
	}

	rec = netWorthRequest(t, router, 1, http.MethodPut, "/api/other-assets/"+itoa(account.ID), map[string]any{"name": "Conta ordenado"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var updated services.OtherAsset
	decodeInto(t, rec, &updated)
	if updated.Name != "Conta ordenado" || updated.ValueEUR != 1300 {
		t.Errorf("unexpected updated asset %+v", updated)
	}

	rec = netWorthRequest(t, router, 1, http.MethodGet, "/api/net-worth", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var nw services.NetWorth
	decodeInto(t, rec, &nw)
	if nw.OtherAssetsEUR != 1300+10216 || nw.TotalEUR != nw.OtherAssetsEUR || len(nw.Assets) != 2 || len(nw.Portfolios) != 1 {
		t.Errorf("unexpected net worth %+v", nw)
	}
}

func TestOtherAssets_RejectsInvalidInput(t *testing.T) {
	router := setupNetWorthTest(t)
	bodies := map[string]map[string]any{
		"unknown type":     {"type": "gold", "name": "x"},
		"crypto not yet":   {"type": "crypto", "name": "BTC"},
		"no name":          {"type": "ppr", "name": " "},
		"other currency":   {"type": "ppr", "name": "PPR", "currency": "USD"},
		"deposit no rate":  {"type": "term_deposit", "name": "DP", "opened_at": "2025-01-01", "details": map[string]any{"principal": 1000, "maturity": "2024-01-01", "capitalisation": "maturity"}},
		"deposit no start": {"type": "term_deposit", "name": "DP", "details": map[string]any{"principal": 1000, "rate_pct": 2, "maturity": "2026-01-01", "capitalisation": "maturity"}},
		"negative value":   {"type": "real_estate", "name": "Casa", "initial_value": -1},
		"future valuation": {"type": "real_estate", "name": "Casa", "initial_value": 1, "initial_date": "2999-01-01"},
		"bad date":         {"type": "other", "name": "Arte", "initial_value": 1, "initial_date": "01-01-2025"},
	}
	for name, body := range bodies {
		if rec := netWorthRequest(t, router, 1, http.MethodPost, "/api/other-assets", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d: %s", name, rec.Code, rec.Body.String())
		}
	}
}

func TestOtherAssets_OnlyTheOwnerCanSeeOrChangeThem(t *testing.T) {
	router := setupNetWorthTest(t)

	rec := netWorthRequest(t, router, 2, http.MethodPost, "/api/other-assets", map[string]any{
		"type": "savings_certificate", "name": "Certificados de Aforro", "initial_value": 5000, "initial_date": "2025-01-10",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var theirs services.OtherAsset
	decodeInto(t, rec, &theirs)
	id := itoa(theirs.ID)
	entryID := itoa(theirs.Entries[0].ID)

	attempts := []struct {
		method, path string
		body         any
	}{
		{http.MethodPut, "/api/other-assets/" + id, map[string]any{"name": "mine now"}},
		{http.MethodDelete, "/api/other-assets/" + id, nil},
		{http.MethodPost, "/api/other-assets/" + id + "/entries", map[string]any{"date": "2025-02-01", "kind": "valuation", "amount": 1}},
		{http.MethodDelete, "/api/other-assets/" + id + "/entries/" + entryID, nil},
	}
	for _, a := range attempts {
		if rec := netWorthRequest(t, router, 1, a.method, a.path, a.body); rec.Code != http.StatusNotFound {
			t.Errorf("%s %s by another user: expected 404, got %d", a.method, a.path, rec.Code)
		}
	}

	var list []services.OtherAsset
	decodeInto(t, netWorthRequest(t, router, 1, http.MethodGet, "/api/other-assets", nil), &list)
	if len(list) != 0 {
		t.Errorf("user 1 should see none of user 2's assets, got %+v", list)
	}
	var nw services.NetWorth
	decodeInto(t, netWorthRequest(t, router, 1, http.MethodGet, "/api/net-worth", nil), &nw)
	if nw.TotalEUR != 0 || len(nw.Assets) != 0 || len(nw.Portfolios) != 1 || nw.Portfolios[0].ID != 1 {
		t.Errorf("user 1's net worth should hold only their own portfolio, got %+v", nw)
	}

	// The owner's asset is untouched.
	decodeInto(t, netWorthRequest(t, router, 2, http.MethodGet, "/api/other-assets", nil), &list)
	if len(list) != 1 || list[0].Name != "Certificados de Aforro" || list[0].ValueEUR != 5000 || len(list[0].Entries) != 1 {
		t.Fatalf("user 2's asset changed: %+v", list)
	}

	// And the owner can delete the entry and then the asset.
	if rec := netWorthRequest(t, router, 2, http.MethodDelete, "/api/other-assets/"+id+"/entries/"+entryID, nil); rec.Code != http.StatusNoContent {
		t.Errorf("owner deleting the entry: expected 204, got %d", rec.Code)
	}
	if rec := netWorthRequest(t, router, 2, http.MethodDelete, "/api/other-assets/"+id, nil); rec.Code != http.StatusNoContent {
		t.Errorf("owner deleting the asset: expected 204, got %d", rec.Code)
	}
	var remaining int
	database.DB.QueryRow("SELECT COUNT(*) FROM other_asset_entries").Scan(&remaining)
	if remaining != 0 {
		t.Errorf("expected no entries left, got %d", remaining)
	}
}

func itoa(id int64) string {
	encoded, _ := json.Marshal(id)
	return string(encoded)
}
