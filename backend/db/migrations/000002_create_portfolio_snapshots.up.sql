CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    total_equity REAL, -- The Market Value of stocks + Cash
    cumulative_net_cashflow REAL, -- Net Deposits (Deposits - Withdrawals)
    cash_balance REAL, -- Uninvested cash
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);