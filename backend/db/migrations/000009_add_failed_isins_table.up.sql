-- Create the failed_isins table to track failed ISIN lookups
CREATE TABLE IF NOT EXISTS failed_isins (
    isin TEXT PRIMARY KEY,
    last_failed TIMESTAMP NOT NULL,
    failure_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on last_failed for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_failed_isins_last_failed ON failed_isins(last_failed);