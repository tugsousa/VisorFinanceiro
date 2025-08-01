package model

import (
	"database/sql"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

// ISINTickerMap represents a row in the isin_ticker_map table.
// It caches the mapping from an ISIN to a specific stock ticker.
type ISINTickerMap struct {
	ISIN          string
	TickerSymbol  string
	Exchange      sql.NullString // Use sql.NullString for nullable TEXT fields
	Currency      string
	CreatedAt     time.Time
	LastCheckedAt sql.NullTime // Use sql.NullTime for nullable TIMESTAMP fields
}

// DailyPrice represents a cached price for a ticker on a specific day.
type DailyPrice struct {
	TickerSymbol string
	Date         string // YYYY-MM-DD
	Price        float64
	Currency     string
	UpdatedAt    time.Time
}

// GetMappingsByISINs retrieves multiple ISIN-to-ticker mappings from the database in a single query.
// It returns a map for easy lookup, where the key is the ISIN.
func GetMappingsByISINs(db *sql.DB, isins []string) (map[string]ISINTickerMap, error) {
	mappings := make(map[string]ISINTickerMap)
	if len(isins) == 0 {
		return mappings, nil
	}

	// Using `IN` clause is efficient for batch lookups.
	// We construct the query with the correct number of placeholders.
	query := `SELECT isin, ticker_symbol, exchange, currency, created_at, last_checked_at FROM isin_ticker_map WHERE isin IN (?` + strings.Repeat(",?", len(isins)-1) + `)`

	// Convert the slice of strings to a slice of interfaces for the query arguments.
	args := make([]interface{}, len(isins))
	for i, isin := range isins {
		args[i] = isin
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var mapping ISINTickerMap
		if err := rows.Scan(
			&mapping.ISIN,
			&mapping.TickerSymbol,
			&mapping.Exchange,
			&mapping.Currency,
			&mapping.CreatedAt,
			&mapping.LastCheckedAt,
		); err != nil {
			return nil, err
		}
		mappings[mapping.ISIN] = mapping
	}

	return mappings, rows.Err()
}

// InsertMapping inserts a single new ISIN-to-ticker mapping into the database.
func InsertMapping(db *sql.DB, mapping ISINTickerMap) error {
	query := `
		INSERT INTO isin_ticker_map (isin, ticker_symbol, exchange, currency, last_checked_at)
		VALUES (?, ?, ?, ?, ?)`

	_, err := db.Exec(query, mapping.ISIN, mapping.TickerSymbol, mapping.Exchange, mapping.Currency, time.Now())
	return err
}

// GetPricesByTickersAndDate retrieves cached prices for a list of tickers on a specific date.
func GetPricesByTickersAndDate(db *sql.DB, tickers []string, date string) (map[string]DailyPrice, error) {
	prices := make(map[string]DailyPrice)
	if len(tickers) == 0 {
		return prices, nil
	}

	query := `SELECT ticker_symbol, date, price, currency, updated_at FROM daily_prices WHERE date = ? AND ticker_symbol IN (?` + strings.Repeat(",?", len(tickers)-1) + `)`
	args := make([]interface{}, len(tickers)+1)
	args[0] = date
	for i, ticker := range tickers {
		args[i+1] = ticker
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var p DailyPrice
		if err := rows.Scan(&p.TickerSymbol, &p.Date, &p.Price, &p.Currency, &p.UpdatedAt); err != nil {
			return nil, err
		}
		prices[p.TickerSymbol] = p
	}
	return prices, rows.Err()
}

// InsertOrUpdatePrice saves a new price to the cache, updating if it already exists for that day.
func InsertOrUpdatePrice(db *sql.DB, price DailyPrice) error {
	// Using ON CONFLICT (UPSERT) is efficient and safe for concurrent operations.
	query := `
        INSERT INTO daily_prices (ticker_symbol, date, price, currency, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ticker_symbol, date) DO UPDATE SET
            price = excluded.price,
            currency = excluded.currency,
            updated_at = excluded.updated_at;
    `
	_, err := db.Exec(query, price.TickerSymbol, price.Date, price.Price, price.Currency, time.Now())
	if err != nil {
		logger.L.Error("Failed to insert or update daily price", "ticker", price.TickerSymbol, "date", price.Date, "error", err)
	}
	return err
}
