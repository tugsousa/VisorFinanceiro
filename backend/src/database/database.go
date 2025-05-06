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

	createTableStatement := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		password TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS processed_transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		date TEXT NOT NULL,
		product_name TEXT NOT NULL,
		isin TEXT,
		quantity INTEGER,
		price REAL,
		order_type TEXT,
		transaction_type TEXT,
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
