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
	migrateUserTable() // Migration for users table
	migrateDatabase()  // Existing migration for processed_transactions

	createTableStatement := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		password TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE,
		auth_provider TEXT DEFAULT 'local',
		is_email_verified BOOLEAN DEFAULT FALSE,
		email_verification_token TEXT,
		email_verification_token_expires_at TIMESTAMP,
		password_reset_token TEXT,
		password_reset_token_expires_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		source TEXT NOT NULL,
		product_name TEXT NOT NULL,
		isin TEXT,
		quantity INTEGER,
		original_quantity INTEGER,
		price REAL,
		transaction_type TEXT,
		transaction_subtype TEXT,
		buy_sell TEXT,
		description TEXT,
		amount REAL,
		currency TEXT,
		commission REAL,
		order_id TEXT,
		exchange_rate REAL,
		amount_eur REAL,
		country_code TEXT,
		input_string TEXT,
		hash_id TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id),
		UNIQUE(user_id, hash_id)
	);
	`

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

func migrateUserTable() {
	var tableName string
	err := DB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").Scan(&tableName)
	if err != nil {
		if err == sql.ErrNoRows {
			if logger.L != nil {
				logger.L.Info("'users' table does not exist, no migration needed as table will be created.")
			} else {
				stdlog.Println("'users' table does not exist, no migration needed as table will be created.")
			}
			return
		}
		if logger.L != nil {
			logger.L.Error("Error checking for 'users' table", "error", err)
		} else {
			stdlog.Printf("Error checking for 'users' table: %v", err)
		}
		return
	}

	rows, err := DB.Query("PRAGMA table_info(users)")
	if err != nil {
		if logger.L != nil {
			logger.L.Error("Error querying table schema for 'users'", "error", err)
		} else {
			stdlog.Printf("Error querying table schema for 'users': %v", err)
		}
		return
	}
	defer rows.Close()

	columnExists := make(map[string]bool)
	for rows.Next() {
		var cid, pk int
		var name, dataType string
		var notnullVal int
		var dfltValue interface{}

		// CORRECTED SCAN: Use &notnullVal
		if err := rows.Scan(&cid, &name, &dataType, &notnullVal, &dfltValue, &pk); err != nil {
			if logger.L != nil {
				logger.L.Error("Error scanning column info for 'users'", "error", err)
			} else {
				stdlog.Printf("Error scanning column info for 'users': %v", err)
			}
			return
		}
		columnExists[name] = true
	}
	if err = rows.Err(); err != nil {
		if logger.L != nil {
			logger.L.Error("Error iterating over column info for 'users'", "error", err)
		} else {
			stdlog.Printf("Error iterating over column info for 'users': %v", err)
		}
		return
	}

	if _, ok := columnExists["email"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''")
		if err != nil {
			logger.L.Error("Error adding 'email' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'email' column to 'users' table. Consider adding a UNIQUE constraint manually later.")
		}
	}

	if _, ok := columnExists["is_email_verified"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT FALSE")
		if err != nil {
			logger.L.Error("Error adding 'is_email_verified' column", "error", err)
		} else {
			logger.L.Info("Added 'is_email_verified' column to 'users' table")
		}
	}
	if _, ok := columnExists["email_verification_token"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN email_verification_token TEXT")
		if err != nil {
			logger.L.Error("Error adding 'email_verification_token' column", "error", err)
		} else {
			logger.L.Info("Added 'email_verification_token' column to 'users' table")
		}
	}
	if _, ok := columnExists["email_verification_token_expires_at"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN email_verification_token_expires_at TIMESTAMP")
		if err != nil {
			logger.L.Error("Error adding 'email_verification_token_expires_at' column", "error", err)
		} else {
			logger.L.Info("Added 'email_verification_token_expires_at' column to 'users' table")
		}
	}

	// ** NEW MIGRATIONS FOR PASSWORD RESET **
	if _, ok := columnExists["password_reset_token"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN password_reset_token TEXT")
		if err != nil {
			logger.L.Error("Error adding 'password_reset_token' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'password_reset_token' column to 'users' table")
		}
	}
	if _, ok := columnExists["password_reset_token_expires_at"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN password_reset_token_expires_at TIMESTAMP")
		if err != nil {
			logger.L.Error("Error adding 'password_reset_token_expires_at' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'password_reset_token_expires_at' column to 'users' table")
		}
	}
	if _, ok := columnExists["auth_provider"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'")
		if err != nil {
			logger.L.Error("Error adding 'auth_provider' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'auth_provider' column to 'users' table")
		}
	}

	if _, ok := columnExists["created_at"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
		if err != nil {
			logger.L.Error("Error adding 'created_at' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'created_at' column to 'users' table")
		}
	}
	if _, ok := columnExists["updated_at"]; !ok {
		_, err := DB.Exec("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
		if err != nil {
			logger.L.Error("Error adding 'updated_at' column to 'users' table", "error", err)
		} else {
			logger.L.Info("Added 'updated_at' column to 'users' table")
		}
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

	columnExists := make(map[string]bool)

	for rows.Next() {
		var cid, pk int
		var name, dataType string
		var notnullVal int
		var dfltValue interface{}

		// CORRECTED SCAN: Use ¬nullVal
		if err := rows.Scan(&cid, &name, &dataType, &notnullVal, &dfltValue, &pk); err != nil {
			if logger.L != nil {
				logger.L.Error("Error scanning column info", "error", err)
			} else {
				stdlog.Printf("Error scanning column info: %v", err)
			}
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
