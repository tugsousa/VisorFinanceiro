-- 000001_initial_schema.up.sql
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
    upload_count INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS isin_ticker_map (
    isin TEXT PRIMARY KEY NOT NULL,
    ticker_symbol TEXT NOT NULL,
    exchange TEXT,
    currency TEXT NOT NULL,
    company_name TEXT, -- Including the column from your manual migration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_prices (
    ticker_symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker_symbol, date)
);