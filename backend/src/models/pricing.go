package models

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

// FailedISIN represents a row in the failed_isins table.
// It tracks ISINs that failed to resolve to a ticker symbol.
type FailedISIN struct {
	ISIN         string
	LastFailed   time.Time
	FailureCount int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// InsertFailedISIN inserts or updates a failed ISIN record.
// If the ISIN already exists, it increments the failure count and updates the timestamp.
func InsertFailedISIN(db *sql.DB, isin string) error {
	query := `
		INSERT INTO failed_isins (isin, last_failed, failure_count, created_at, updated_at)
		VALUES (?, ?, 1, ?, ?)
		ON CONFLICT(isin) DO UPDATE SET
			last_failed = excluded.last_failed,
			failure_count = failed_isins.failure_count + 1,
			updated_at = excluded.updated_at;
	`
	now := time.Now()
	_, err := db.Exec(query, isin, now, now, now)
	return err
}

// GetFailedISINs retrieves all failed ISINs from the database.
func GetFailedISINs(db *sql.DB) (map[string]time.Time, error) {
	failedISINs := make(map[string]time.Time)
	query := `SELECT isin, last_failed FROM failed_isins`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var isin string
		var lastFailed time.Time
		if err := rows.Scan(&isin, &lastFailed); err != nil {
			logger.L.Error("Error scanning failed ISIN row", "error", err)
			continue
		}
		failedISINs[isin] = lastFailed
	}
	return failedISINs, rows.Err()
}

// CleanExpiredFailedISINs removes failed ISIN records older than the specified TTL.
func CleanExpiredFailedISINs(db *sql.DB, ttl time.Duration) error {
	cutoff := time.Now().Add(-ttl)
	query := `DELETE FROM failed_isins WHERE last_failed < ?`
	_, err := db.Exec(query, cutoff)
	return err
}

// ISINTickerMap represents a row in the isin_ticker_map table.
// It caches the mapping from an ISIN to a specific stock ticker.
type ISINTickerMap struct {
	ISIN         string
	TickerSymbol string
	Exchange     sql.NullString // Use sql.NullString for nullable TEXT fields
	Currency     string
	Sector       sql.NullString // New field
	Industry     sql.NullString // New field
	QuoteType    sql.NullString // New field
	// SectorWeights is a fund's sector breakdown as JSON; see AssetMetadata.SectorWeights.
	SectorWeights     sql.NullString
	MetadataUpdatedAt sql.NullTime
	CreatedAt         time.Time
	LastCheckedAt     sql.NullTime // Use sql.NullTime for nullable TIMESTAMP fields
}

// AssetMetadata is what Yahoo Finance tells us about a listing.
type AssetMetadata struct {
	Sector    string
	Industry  string
	QuoteType string
	// SectorWeights is the share of a fund's value in each sector (0-1), with "Bonds" for its
	// bond part. Empty for a single stock. The shares can add up to less than 1 (the fund's cash).
	SectorWeights map[string]float64
}

// ParsedSectorWeights returns the stored sector breakdown, or nil when there is none.
func (m ISINTickerMap) ParsedSectorWeights() map[string]float64 {
	if !m.SectorWeights.Valid || m.SectorWeights.String == "" {
		return nil
	}
	var weights map[string]float64
	if err := json.Unmarshal([]byte(m.SectorWeights.String), &weights); err != nil || len(weights) == 0 {
		return nil
	}
	return weights
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
	// Updated query to select new metadata columns
	query := `SELECT isin, ticker_symbol, exchange, currency, sector, industry, quote_type, sector_weights, metadata_updated_at, created_at, last_checked_at FROM isin_ticker_map WHERE isin IN (?` + strings.Repeat(",?", len(isins)-1) + `)`
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
			&mapping.Sector,
			&mapping.Industry,
			&mapping.QuoteType,
			&mapping.SectorWeights,
			&mapping.MetadataUpdatedAt,
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

// UpdateMappingTicker points an existing ISIN mapping to a different listing.
func UpdateMappingTicker(db *sql.DB, isin, ticker, exchange, currency string) error {
	query := `
		UPDATE isin_ticker_map
		SET ticker_symbol = ?, exchange = ?, currency = ?, last_checked_at = ?
		WHERE isin = ?`
	_, err := db.Exec(query, ticker, exchange, currency, time.Now(), isin)
	return err
}

// BatchInsertMappings inserts multiple ISIN-to-ticker mappings in a single batch operation.
// Optimized for better performance with larger batches.
func BatchInsertMappings(db *sql.DB, mappings []ISINTickerMap) error {
	if len(mappings) == 0 {
		return nil
	}

	// Use transaction for better performance with multiple operations
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Prepare statement once for better performance
	stmt, err := tx.Prepare(`INSERT INTO isin_ticker_map (isin, ticker_symbol, exchange, currency, last_checked_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(isin) DO UPDATE SET
			ticker_symbol = excluded.ticker_symbol,
			exchange = excluded.exchange,
			currency = excluded.currency,
			last_checked_at = excluded.last_checked_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	// Execute batch inserts
	for _, mapping := range mappings {
		_, err := stmt.Exec(mapping.ISIN, mapping.TickerSymbol, mapping.Exchange, mapping.Currency, time.Now())
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// UpdateMappingMetadata stores the metadata of a mapping and when it was fetched.
func UpdateMappingMetadata(db *sql.DB, isin string, meta AssetMetadata) error {
	var weights sql.NullString
	if len(meta.SectorWeights) > 0 {
		b, err := json.Marshal(meta.SectorWeights)
		if err != nil {
			return err
		}
		weights = sql.NullString{String: string(b), Valid: true}
	}
	query := `UPDATE isin_ticker_map SET sector=?, industry=?, quote_type=?, sector_weights=?, metadata_updated_at=? WHERE isin=?`
	_, err := db.Exec(query, meta.Sector, meta.Industry, meta.QuoteType, weights, time.Now(), isin)
	return err
}

// Returns a map of Date (YYYY-MM-DD) -> Price.
func GetPricesByTicker(db *sql.DB, ticker string) (map[string]float64, error) {
	prices := make(map[string]float64)
	// Query to get all recorded dates and prices for this ticker
	query := `SELECT date, price FROM daily_prices WHERE ticker_symbol = ? ORDER BY date ASC`
	rows, err := db.Query(query, ticker)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var date string
		var price float64
		if err := rows.Scan(&date, &price); err != nil {
			logger.L.Error("Error scanning price row", "ticker", ticker, "error", err)
			continue
		}
		prices[date] = price
	}
	return prices, rows.Err()
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

// GetHistoricalPricesByTicker returns all rows in daily_prices for a given ticker, keyed by date string.
// This is a straightforward SELECT date, price FROM daily_prices WHERE ticker_symbol = ? mapped into a map[string]float64.
func GetHistoricalPricesByTicker(db *sql.DB, ticker string) (map[string]float64, error) {
	prices := make(map[string]float64)
	query := `SELECT date, price FROM daily_prices WHERE ticker_symbol = ? ORDER BY date ASC`
	rows, err := db.Query(query, ticker)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var date string
		var price float64
		if err := rows.Scan(&date, &price); err != nil {
			logger.L.Error("Error scanning historical price row", "ticker", ticker, "error", err)
			continue
		}
		prices[date] = price
	}
	return prices, rows.Err()
}

// StoreHistoricalPricesInDB bulk-upserts a full PriceMap into daily_prices inside a transaction.
// Called asynchronously (go) so the caller isn't blocked.
func StoreHistoricalPricesInDB(db *sql.DB, ticker, currency string, prices map[string]float64) error {
	if len(prices) == 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO daily_prices (ticker_symbol, date, price, currency, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(ticker_symbol, date) DO UPDATE SET
			price = excluded.price,
			currency = excluded.currency,
			updated_at = excluded.updated_at;
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now()
	for date, price := range prices {
		if _, err := stmt.Exec(ticker, date, price, currency, now); err != nil {
			logger.L.Error("Failed to insert historical price row", "ticker", ticker, "date", date, "error", err)
			return err
		}
	}

	return tx.Commit()
}
