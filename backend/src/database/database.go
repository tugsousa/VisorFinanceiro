package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB() {
	db, err := sql.Open("sqlite", "./taxfolio.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	DB = db

	// Check if we need to migrate the database
	migrateDatabase()

	createTableStatement := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		password TEXT NOT NULL
	);
	
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		token TEXT NOT NULL,
		refresh_token TEXT NOT NULL,
		user_agent TEXT,
		client_ip TEXT,
		is_blocked BOOLEAN DEFAULT FALSE,
		expires_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS processed_transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		date TEXT NOT NULL,
		product_name TEXT NOT NULL,
		isin TEXT,
		quantity INTEGER,
		original_quantity INTEGER,
		price REAL,
		order_type TEXT,
		transaction_type TEXT,
		description TEXT,
		amount REAL,
		currency TEXT,
		commission REAL,
		order_id TEXT,
		exchange_rate REAL,
		amount_eur REAL,
		country_code TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`

	_, err = DB.Exec(createTableStatement)
	if err != nil {
		log.Fatalf("failed to create table: %v", err)
	}
}

// migrateDatabase handles database schema migrations
func migrateDatabase() {
	// Check if the processed_transactions table exists
	var tableName string
	err := DB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='processed_transactions'").Scan(&tableName)
	if err != nil {
		if err == sql.ErrNoRows {
			// Table doesn't exist yet, no migration needed
			return
		}
		log.Printf("Error checking for processed_transactions table: %v", err)
		return
	}

	// Check if original_quantity column exists
	var columnName string
	err = DB.QueryRow("PRAGMA table_info(processed_transactions)").Scan(&columnName)
	if err != nil {
		log.Printf("Error checking table schema: %v", err)
		return
	}

	// Get all column names
	rows, err := DB.Query("PRAGMA table_info(processed_transactions)")
	if err != nil {
		log.Printf("Error querying table schema: %v", err)
		return
	}
	defer rows.Close()

	// Check if our new columns exist
	hasOriginalQuantity := false
	hasDescription := false

	for rows.Next() {
		var cid, notnull, pk int
		var name, dataType string
		var dfltValue interface{}

		if err := rows.Scan(&cid, &name, &dataType, &notnull, &dfltValue, &pk); err != nil {
			log.Printf("Error scanning column info: %v", err)
			continue
		}

		if name == "original_quantity" {
			hasOriginalQuantity = true
		}
		if name == "description" {
			hasDescription = true
		}
	}

	// Add missing columns if needed
	if !hasOriginalQuantity {
		_, err := DB.Exec("ALTER TABLE processed_transactions ADD COLUMN original_quantity INTEGER")
		if err != nil {
			log.Printf("Error adding original_quantity column: %v", err)
		} else {
			log.Println("Added original_quantity column to processed_transactions table")

			// Update existing rows to set original_quantity equal to quantity
			_, err = DB.Exec("UPDATE processed_transactions SET original_quantity = quantity")
			if err != nil {
				log.Printf("Error updating original_quantity values: %v", err)
			}
		}
	}

	if !hasDescription {
		_, err := DB.Exec("ALTER TABLE processed_transactions ADD COLUMN description TEXT")
		if err != nil {
			log.Printf("Error adding description column: %v", err)
		} else {
			log.Println("Added description column to processed_transactions table")
		}
	}
}
