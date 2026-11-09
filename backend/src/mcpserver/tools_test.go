package mcpserver

import (
	"context"
	"database/sql"
	"testing"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	_ "modernc.org/sqlite"
)

// setupTestDB creates two users' portfolios and transactions: user 1 owns portfolios 1 (default) and
// 2, user 2 owns portfolio 3.
func setupTestDB(t *testing.T) {
	t.Helper()
	logger.InitLogger("error")

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	db.SetMaxOpenConns(1)
	previousDB := database.DB
	database.DB = db
	t.Cleanup(func() {
		db.Close()
		database.DB = previousDB
	})

	statements := []string{
		`CREATE TABLE portfolios (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, description TEXT, is_default BOOLEAN)`,
		`CREATE TABLE processed_transactions (
			id INTEGER PRIMARY KEY, user_id INTEGER, portfolio_id INTEGER, date TEXT, source TEXT, product_name TEXT,
			isin TEXT, quantity REAL, price REAL, transaction_type TEXT, transaction_subtype TEXT, buy_sell TEXT,
			description TEXT, amount REAL, currency TEXT, commission REAL, amount_eur REAL)`,
		`INSERT INTO portfolios VALUES (1, 1, 'Main', '', 1), (2, 1, 'Second', '', 0), (3, 2, 'Other user', '', 1)`,
		`INSERT INTO processed_transactions
			(user_id, portfolio_id, date, source, product_name, isin, quantity, price, transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, amount_eur)
		VALUES
			(1, 1, '15-03-2024', 'degiro', 'Apple', 'US0378331005', 1, 100, 'STOCK', '', 'BUY', '', -100, 'USD', 1, -92),
			(1, 1, '02-01-2025', 'degiro', 'Apple', 'US0378331005', 1, 150, 'STOCK', '', 'SELL', '', 150, 'USD', 1, 140),
			(1, 1, '20-11-2024', 'degiro', 'Microsoft', 'US5949181045', 2, 400, 'STOCK', '', 'BUY', '', -800, 'USD', 1, -740),
			(1, 2, '01-01-2025', 'ibkr', 'In the second portfolio', 'X', 1, 1, 'STOCK', '', 'BUY', '', -1, 'EUR', 0, -1),
			(2, 3, '01-01-2025', 'ibkr', 'Of the other user', 'X', 1, 1, 'STOCK', '', 'BUY', '', -1, 'EUR', 0, -1)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("failed to prepare the database: %v", err)
		}
	}
}

func TestPortfolioOnlyOfTheUser(t *testing.T) {
	setupTestDB(t)
	s := &Server{userID: 1}

	if p, err := s.portfolio(0); err != nil || p.ID != 1 {
		t.Errorf("default portfolio = %v, %v; want portfolio 1", p, err)
	}
	if p, err := s.portfolio(2); err != nil || p.ID != 2 {
		t.Errorf("portfolio 2 = %v, %v; want portfolio 2", p, err)
	}
	if p, err := s.portfolio(3); err == nil {
		t.Errorf("portfolio 3 of another user = %v; want an error", p)
	}

	if _, err := (&Server{userID: 99}).portfolio(0); err == nil {
		t.Error("a user without portfolios got a default portfolio")
	}
}

func TestGetTransactions(t *testing.T) {
	setupTestDB(t)
	s := &Server{userID: 1}

	transactionsOf := func(in transactionsInput) []string {
		t.Helper()
		_, out, err := s.getTransactions(context.Background(), nil, in)
		if err != nil {
			t.Fatalf("getTransactions(%+v) failed: %v", in, err)
		}
		var dates []string
		for _, tx := range out.(map[string]any)["transactions"].([]transaction) {
			dates = append(dates, tx.Date+" "+tx.Name)
		}
		return dates
	}

	assertEqual(t, transactionsOf(transactionsInput{}),
		[]string{"02-01-2025 Apple", "20-11-2024 Microsoft", "15-03-2024 Apple"})
	assertEqual(t, transactionsOf(transactionsInput{Year: 2024}),
		[]string{"20-11-2024 Microsoft", "15-03-2024 Apple"})
	assertEqual(t, transactionsOf(transactionsInput{ISIN: "us0378331005", Limit: 1}),
		[]string{"02-01-2025 Apple"})
	assertEqual(t, transactionsOf(transactionsInput{Search: "micro"}),
		[]string{"20-11-2024 Microsoft"})
	assertEqual(t, transactionsOf(transactionsInput{PortfolioID: 2}),
		[]string{"01-01-2025 In the second portfolio"})

	if _, _, err := s.getTransactions(context.Background(), nil, transactionsInput{PortfolioID: 3}); err == nil {
		t.Error("got the transactions of another user's portfolio")
	}
}

func TestPeriodOf(t *testing.T) {
	cases := []struct{ date, interval, want string }{
		{"2025-03-14", "daily", "2025-03-14"},
		{"2025-03-14", "monthly", "2025-03"},
		{"2025-03-14", "weekly", "2025-W11"},
		{"2024-12-30", "weekly", "2025-W01"},
	}
	for _, c := range cases {
		if got := periodOf(c.date, c.interval); got != c.want {
			t.Errorf("periodOf(%q, %q) = %q; want %q", c.date, c.interval, got, c.want)
		}
	}
}

func TestDateHelpers(t *testing.T) {
	if got := dateKey("02-01-2025"); got != "2025-01-02" {
		t.Errorf("dateKey = %q", got)
	}
	if got := yearOf("31-12-2024"); got != "2024" {
		t.Errorf("yearOf = %q", got)
	}
	if !matchesYear("31-12-2024", 2024) || matchesYear("31-12-2024", 2025) || !matchesYear("31-12-2024", 0) {
		t.Error("matchesYear is wrong")
	}
}

func assertEqual(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %q; want %q", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("got %q; want %q", got, want)
		}
	}
}
