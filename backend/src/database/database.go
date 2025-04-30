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
	`

	_, err = DB.Exec(createTableStatement)
	if err != nil {
		log.Fatalf("failed to create table: %v", err)
	}
}
