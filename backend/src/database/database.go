// backend/src/database/database.go
package database

import (
	"database/sql"
	"errors"
	"fmt"
	stdlog "log"
	"os"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/username/taxfolio/backend/src/logger"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB(databasePath string) {
	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)", databasePath)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		stdlog.Fatalf("failed to open database at %s: %v", databasePath, err)
	}

	// Limit open connections to 1 for SQLite to avoid locking issues
	db.SetMaxOpenConns(1)

	if err = db.Ping(); err != nil {
		stdlog.Fatalf("failed to ping database: %v", err)
	}
	DB = db
	logger.L.Info("Database connection established with WAL mode, busy_timeout, and foreign_keys enabled.")
}

func RunMigrations(databasePath string) {
	if DB == nil {
		logger.L.Error("Database connection is not initialized before running migrations")
		return
	}

	driver, err := sqlite.WithInstance(DB, &sqlite.Config{})
	if err != nil {
		logger.L.Error("Could not create sqlite migration driver", "error", err)
		stdlog.Fatalf("could not create sqlite migration driver: %v", err)
	}

	var migrationsSourceURL string

	if os.Getenv("GO_ENV") == "PRO" {
		migrationsSourceURL = "file:///app/db/migrations"
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			stdlog.Fatalf("failed to get current working directory: %v", err)
		}
		localMigrationsPath := filepath.Join(cwd, "db", "migrations")
		migrationsSourceURL = fmt.Sprintf("file://%s", filepath.ToSlash(localMigrationsPath))
	}

	m, err := migrate.NewWithDatabaseInstance(
		migrationsSourceURL,
		databasePath,
		driver,
	)
	if err != nil {
		logger.L.Error("Migration instance creation failed", "source", migrationsSourceURL, "error", err)
		stdlog.Fatalf("migration instance creation failed: %v", err)
	}

	logger.L.Info("Applying database migrations...", "source", migrationsSourceURL)
	err = m.Up()
	if err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			logger.L.Info("No new database migrations to apply.")
		} else {
			logger.L.Error("Failed to apply migrations", "error", err)
			stdlog.Fatalf("failed to apply migrations: %v", err)
		}
	} else {
		logger.L.Info("Database migrations applied successfully.")
	}
}
