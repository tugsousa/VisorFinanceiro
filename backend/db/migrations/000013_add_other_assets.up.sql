-- Savings and assets that aren't at a broker (term deposits, Certificados de Aforro, current accounts, PPR,
-- property...). They belong to the user, not to a portfolio, so they never change a portfolio's returns or IRS.
-- 'crypto' is accepted here already so that its phase doesn't need to rebuild the table to change the CHECK.
CREATE TABLE IF NOT EXISTS other_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('term_deposit', 'savings_certificate', 'crypto', 'cash_account', 'ppr', 'real_estate', 'other')),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    details TEXT,       -- JSON with what the type needs, e.g. a term deposit's principal, rate, maturity and capitalisation
    opened_at TEXT,     -- YYYY-MM-DD; a term deposit's start date
    closed_at TEXT,     -- YYYY-MM-DD; the asset is worth nothing from this date on
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_other_assets_user ON other_assets(user_id);

-- Money moved in or out of an asset, kept apart from the valuations the user enters, so that a history and
-- returns can be worked out. Amounts are positive; the kind gives the direction.
CREATE TABLE IF NOT EXISTS other_asset_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES other_assets(id) ON DELETE CASCADE,
    date TEXT NOT NULL, -- YYYY-MM-DD
    kind TEXT NOT NULL CHECK(kind IN ('contribution', 'withdrawal', 'valuation', 'interest')),
    amount REAL NOT NULL,
    quantity REAL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_other_asset_entries_asset_date ON other_asset_entries(asset_id, date);
