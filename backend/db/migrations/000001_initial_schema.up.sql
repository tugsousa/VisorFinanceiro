-- 000001_initial_schema.up.sql

-- Main users table with added tracking fields
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    auth_provider TEXT DEFAULT 'local',
    
    -- Verification & Reset Tokens
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token TEXT,
    email_verification_token_expires_at TIMESTAMP,
    password_reset_token TEXT,
    password_reset_token_expires_at TIMESTAMP,

    -- KPI Fields for Admin Dashboard
    upload_count INTEGER DEFAULT 0, -- Current number of distinct sources
    total_upload_count INTEGER DEFAULT 0, -- Cumulative uploads over all time
    login_count INTEGER DEFAULT 0,
    last_login_at TIMESTAMP,
    last_login_ip TEXT,
    portfolio_value_eur REAL DEFAULT 0,
    top_5_holdings TEXT, -- Stored as JSON: '[{"name": "AAPL", "value": 15000}, ...]'

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Login history for tracking DAU/MAU and user activity
CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Upload history for tracking uploads over time
CREATE TABLE IF NOT EXISTS uploads_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    filename TEXT,
    file_size INTEGER,
    transaction_count INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table for authentication
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
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Processed transactions from user uploads
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
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, hash_id)
);

-- Mapping and pricing cache tables
CREATE TABLE IF NOT EXISTS isin_ticker_map (
    isin TEXT PRIMARY KEY NOT NULL,
    ticker_symbol TEXT NOT NULL,
    exchange TEXT,
    currency TEXT NOT NULL,
    company_name TEXT,
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

-- Tabela para guardar métricas gerais do sistema (ADICIONADO)
CREATE TABLE IF NOT EXISTS system_metrics (
    metric_name TEXT PRIMARY KEY NOT NULL,
    metric_value INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir o contador inicial para contas eliminadas (ADICIONADO)
INSERT INTO system_metrics (metric_name, metric_value) 
VALUES ('deleted_user_count', 0);