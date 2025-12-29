-- Disable foreign key constraints temporarily to avoid issues during the swap
PRAGMA foreign_keys = OFF;

-- 1. Create the new table with the `updated_at` column included
CREATE TABLE portfolio_snapshots_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    portfolio_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    total_equity REAL,
    cumulative_net_cashflow REAL,
    cash_balance REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    
    UNIQUE(user_id, portfolio_id, date)
);

-- 2. Copy existing data to the new table
-- We populate `updated_at` with the current time for existing rows
INSERT INTO portfolio_snapshots_new (id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at, updated_at)
SELECT id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at, CURRENT_TIMESTAMP
FROM portfolio_snapshots;

-- 3. Drop the old table
DROP TABLE portfolio_snapshots;

-- 4. Rename the new table to the original name
ALTER TABLE portfolio_snapshots_new RENAME TO portfolio_snapshots;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;