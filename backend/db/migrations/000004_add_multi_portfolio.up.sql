-- 1. Create Portfolios Table
CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- 2. Create a 'Default Portfolio' for every existing user
INSERT INTO portfolios (user_id, name, description, is_default)
SELECT id, 'Portfolio Principal', 'Automatically created from existing data', TRUE FROM users;

-- 3. Recreate processed_transactions to include portfolio_id
-- We rename the old table, create a new one with the portfolio_id column, copy data, and drop the old one.
CREATE TABLE processed_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    portfolio_id INTEGER NOT NULL, -- New Column
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
    cash_balance REAL,
    balance_currency TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    UNIQUE(portfolio_id, hash_id) -- Constraint is now scoped to Portfolio
);

-- Copy existing data, mapping it to the user's new Default Portfolio
INSERT INTO processed_transactions_new (
    user_id, portfolio_id, date, source, product_name, isin, quantity, original_quantity,
    price, transaction_type, transaction_subtype, buy_sell, description, amount,
    currency, commission, order_id, exchange_rate, amount_eur, country_code,
    input_string, hash_id, cash_balance, balance_currency
)
SELECT 
    pt.user_id, 
    p.id, 
    pt.date, pt.source, pt.product_name, pt.isin, pt.quantity, pt.original_quantity,
    pt.price, pt.transaction_type, pt.transaction_subtype, pt.buy_sell, pt.description, pt.amount,
    pt.currency, pt.commission, pt.order_id, pt.exchange_rate, pt.amount_eur, pt.country_code,
    pt.input_string, pt.hash_id, pt.cash_balance, pt.balance_currency
FROM processed_transactions pt
JOIN portfolios p ON pt.user_id = p.user_id;

-- Drop old table and rename new one
DROP TABLE processed_transactions;
ALTER TABLE processed_transactions_new RENAME TO processed_transactions;

-- 4. Update other tables to include portfolio_id
ALTER TABLE uploads_history ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE;
UPDATE uploads_history SET portfolio_id = (SELECT id FROM portfolios WHERE user_id = uploads_history.user_id);

ALTER TABLE portfolio_snapshots ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE;
UPDATE portfolio_snapshots SET portfolio_id = (SELECT id FROM portfolios WHERE user_id = portfolio_snapshots.user_id);