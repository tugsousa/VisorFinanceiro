PRAGMA foreign_keys = OFF;

CREATE TABLE portfolio_snapshots_old (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    portfolio_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    total_equity REAL,
    cumulative_net_cashflow REAL,
    cash_balance REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    
    UNIQUE(user_id, portfolio_id, date)
);

INSERT INTO portfolio_snapshots_old (id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at)
SELECT id, user_id, portfolio_id, date, total_equity, cumulative_net_cashflow, cash_balance, created_at
FROM portfolio_snapshots;

DROP TABLE portfolio_snapshots;

ALTER TABLE portfolio_snapshots_old RENAME TO portfolio_snapshots;

PRAGMA foreign_keys = ON;