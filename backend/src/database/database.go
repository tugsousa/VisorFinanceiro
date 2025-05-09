package database

import (
	"database/sql"
	// Standard log for bootstrap messages if logger isn't ready
	stdlog "log" // Renamed to avoid conflict with global logger variable

	"github.com/username/taxfolio/backend/src/logger" // Import your slog wrapper
	_ "modernc.org/sqlite"
)

var DB *sql.DB

// InitDB initializes the database connection.
// It now takes the databasePath as an argument.
func InitDB(databasePath string) {
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		// Use standard log here as logger.L might not be initialized yet if InitDB is called before InitLogger
		stdlog.Fatalf("failed to open database at %s: %v", databasePath, err)
	}

	DB = db

	// Check if we need to migrate the database
	// It's better to call migrateDatabase after logger is initialized if it logs
	if logger.L != nil {
		logger.L.Info("Checking database migrations", "databasePath", databasePath)
	} else {
		stdlog.Println("Checking database migrations for:", databasePath)
	}
	migrateDatabase() // migrateDatabase itself uses logger.L if available

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
		if logger.L != nil {
			logger.L.Error("failed to create tables", "error", err)
		}
		stdlog.Fatalf("failed to create tables: %v", err) // Fatal if basic tables can't be made
	}
	if logger.L != nil {
		logger.L.Info("Database tables ensured/created.")
	} else {
		stdlog.Println("Database tables ensured/created.")
	}
}

// migrateDatabase handles database schema migrations
func migrateDatabase() {
	var tableName string
	err := DB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='processed_transactions'").Scan(&tableName)
	if err != nil {
		if err == sql.ErrNoRows {
			if logger.L != nil {
				logger.L.Info("processed_transactions table does not exist, no migration needed yet.")
			} else {
				stdlog.Println("processed_transactions table does not exist, no migration needed yet.")
			}
			return
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

	hasOriginalQuantity := false
	hasDescription := false

	for rows.Next() {
		var cid, notnull, pk int
		var name, dataType string
		var dfltValue interface{}

		// Corrected line:
		if err := rows.Scan(&cid, &name, &dataType, notnull, &dfltValue, &pk); err != nil {
			if logger.L != nil {
				logger.L.Error("Error scanning column info", "error", err)
			} else {
				stdlog.Printf("Error scanning column info: %v", err)
			}
			continue
		}

		if name == "original_quantity" {
			hasOriginalQuantity = true
		}
		if name == "description" {
			hasDescription = true
		}
	}

	if err = rows.Err(); err != nil {
		if logger.L != nil {
			logger.L.Error("Error iterating over column info", "error", err)
		} else {
			stdlog.Printf("Error iterating over column info: %v", err)
		}
		return
	}

	if !hasOriginalQuantity {
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
			_, err = DB.Exec("UPDATE processed_transactions SET original_quantity = quantity")
			if err != nil {
				if logger.L != nil {
					logger.L.Error("Error updating original_quantity values", "error", err)
				} else {
					stdlog.Printf("Error updating original_quantity values: %v", err)
				}
			}
		}
	}

	if !hasDescription {
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
