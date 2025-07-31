package model

import (
	"database/sql"
	"strings"
	"time"
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
