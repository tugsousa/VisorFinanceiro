package database

import (
	"database/sql"
	stdlog "log"

	"github.com/username/taxfolio/backend/src/logger"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB(databasePath string) {
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		stdlog.Fatalf("failed to open database at %s: %v", databasePath, err)
	}

	DB = db

	if logger.L != nil {
		logger.L.Info("Checking database migrations", "databasePath", databasePath)
	} else {
		stdlog.Println("Checking database migrations for:", databasePath)
	}
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
		original_quantity INTEGER, -- Will be added by migration if not exists
		price REAL,
		order_type TEXT,
		transaction_type TEXT,
		description TEXT,          -- Will be added by migration if not exists
		amount REAL,
		currency TEXT,
		commission REAL,
		order_id TEXT,
		exchange_rate REAL,
		amount_eur REAL,
		country_code TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	` // Removed trailing comma from country_code

	_, err = DB.Exec(createTableStatement)
	if err != nil {
		if logger.L != nil {
			logger.L.Error("failed to create tables", "error", err)
		}
		stdlog.Fatalf("failed to create tables: %v", err)
	}
	if logger.L != nil {
		logger.L.Info("Database tables ensured/created.")
	} else {
		stdlog.Println("Database tables ensured/created.")
	}
}

func migrateDatabase() {
	var tableName string
	err := DB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='processed_transactions'").Scan(&tableName)
	if err != nil {
		if err == sql.ErrNoRows {
			if logger.L != nil {
				logger.L.Info("processed_transactions table does not exist, no migration needed as table will be created.")
			} else {
				stdlog.Println("processed_transactions table does not exist, no migration needed as table will be created.")
			}
			return // Table will be created by InitDB, so no ALTER needed
		}
		if logger.L != nil {
			logger.L.Error("Error checking for processed_transactions table", "error", err)
		} else {
			stdlog.Printf("Error checking for processed_transactions table: %v", err)
		}
		return
	}

	rows, err := DB.Query("PRAGMA table_info(processed_transactions)")
	if err != nil {
		if logger.L != nil {
			logger.L.Error("Error querying table schema for processed_transactions", "error", err)
		} else {
			stdlog.Printf("Error querying table schema: %v", err)
		}
		return
	}
	defer rows.Close()

	columnExists := make(map[string]bool)

	for rows.Next() {
		var cid, pk int
		var name, dataType string
		var notnullVal int // Changed to notnullVal to avoid confusion
		var dfltValue interface{}

		// Corrected line: pass the address of notnullVal
		if err := rows.Scan(&cid, &name, &dataType, notnullVal, &dfltValue, &pk); err != nil {
			if logger.L != nil {
				logger.L.Error("Error scanning column info", "error", err)
			} else {
				stdlog.Printf("Error scanning column info: %v", err)
			}
			// Continue to try and scan other rows, but this row is problematic.
			// Or return, as schema inspection is now unreliable. For migrations, better to be cautious.
			return
		}
		columnExists[name] = true
	}

	if err = rows.Err(); err != nil {
		if logger.L != nil {
			logger.L.Error("Error iterating over column info", "error", err)
		} else {
			stdlog.Printf("Error iterating over column info: %v", err)
		}
		return
	}

	// Migration for original_quantity
	if _, ok := columnExists["original_quantity"]; !ok {
		_, err := DB.Exec("ALTER TABLE processed_transactions ADD COLUMN original_quantity INTEGER")
		if err != nil {
			if logger.L != nil {
				logger.L.Error("Error adding original_quantity column", "error", err)
			} else {
				stdlog.Printf("Error adding original_quantity column: %v", err)
			}
		} else {
			if logger.L != nil {
				logger.L.Info("Added original_quantity column to processed_transactions table")
			} else {
				stdlog.Println("Added original_quantity column to processed_transactions table")
			}
			// Initialize original_quantity with quantity for existing rows
			_, errUpdate := DB.Exec("UPDATE processed_transactions SET original_quantity = quantity WHERE original_quantity IS NULL")
			if errUpdate != nil {
				if logger.L != nil {
					logger.L.Error("Error updating original_quantity values for existing rows", "error", errUpdate)
				} else {
					stdlog.Printf("Error updating original_quantity values for existing rows: %v", errUpdate)
				}
			}
		}
	}

	// Migration for description
	if _, ok := columnExists["description"]; !ok {
		_, err := DB.Exec("ALTER TABLE processed_transactions ADD COLUMN description TEXT")
		if err != nil {
			if logger.L != nil {
				logger.L.Error("Error adding description column", "error", err)
			} else {
				stdlog.Printf("Error adding description column: %v", err)
			}
		} else {
			if logger.L != nil {
				logger.L.Info("Added description column to processed_transactions table")
			} else {
				stdlog.Println("Added description column to processed_transactions table")
			}
		}
	}
}
