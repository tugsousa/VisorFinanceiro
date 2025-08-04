// backend/src/database/database.go
package database

import (
	"database/sql"
	"errors" // Import errors package
	stdlog "log"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/username/taxfolio/backend/src/logger"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB(databasePath string) {
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		stdlog.Fatalf("failed to open database at %s: %v", databasePath, err)
	}

	// Ping the database to verify the connection is alive.
	if err = db.Ping(); err != nil {
		stdlog.Fatalf("failed to ping database: %v", err)
	}

	DB = db
	logger.L.Info("Database connection established.")
}

// New function to run migrations
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

	// The path is relative to the backend executable's location
	m, err := migrate.NewWithDatabaseInstance(
		"file:///app/db/migrations",
		databasePath,
		driver,
	)
	if err != nil {
		logger.L.Error("Migration instance creation failed", "error", err)
		stdlog.Fatalf("migration instance creation failed: %v", err)
	}

	logger.L.Info("Applying database migrations...")
	err = m.Up() // Apply all available "up" migrations
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
