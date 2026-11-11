-- Target allocation: groups of holdings the user creates, each with a target share of the portfolio.
-- includes_cash puts the broker cash balance in that group.
CREATE TABLE IF NOT EXISTS allocation_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_pct REAL NOT NULL,
    color TEXT,
    sort_order INTEGER,
    includes_cash INTEGER NOT NULL DEFAULT 0,
    UNIQUE(portfolio_id, name)
);

-- The group of each holding. preferred marks the asset to buy for that group.
CREATE TABLE IF NOT EXISTS allocation_assignments (
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    isin TEXT NOT NULL,
    group_id INTEGER NOT NULL REFERENCES allocation_groups(id) ON DELETE CASCADE,
    preferred INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(portfolio_id, isin)
);

CREATE INDEX IF NOT EXISTS idx_allocation_assignments_group ON allocation_assignments(group_id);

-- How many percentage points a group may drift from its target before it's flagged.
CREATE TABLE IF NOT EXISTS allocation_settings (
    portfolio_id INTEGER PRIMARY KEY REFERENCES portfolios(id) ON DELETE CASCADE,
    tolerance_pp REAL NOT NULL DEFAULT 5
);
