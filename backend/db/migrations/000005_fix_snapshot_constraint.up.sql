-- backend/db/migrations/000005_fix_snapshot_constraint.up.sql

-- 1. Create the new table with the CORRECT unique constraint (including portfolio_id)
CREATE TABLE portfolio_snapshots_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    portfolio_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    total_equity REAL,
    cumulative_net_cashflow REAL,
    cash_balance REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- THIS IS THE FIX: The constraint must include portfolio_id
    UNIQUE(user_id, portfolio_id, date)
);

-- 2. Copy existing data
-- We assume the column order matches. If you strictly followed previous steps, it does.
INSERT INTO portfolio_snapshots_new (id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at)
SELECT id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at 
FROM portfolio_snapshots;

-- 3. Swap tables
DROP TABLE portfolio_snapshots;
ALTER TABLE portfolio_snapshots_new RENAME TO portfolio_snapshots;