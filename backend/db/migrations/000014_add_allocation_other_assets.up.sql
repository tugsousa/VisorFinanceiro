-- Other assets (savings outside the brokers) counted in a portfolio's allocation groups. The asset stays the
-- user's: a row only says that this portfolio's targets take it into account, in that group. A separate table
-- rather than a change to allocation_assignments, whose primary key is (portfolio_id, isin).
CREATE TABLE IF NOT EXISTS allocation_other_assignments (
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    other_asset_id INTEGER NOT NULL REFERENCES other_assets(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES allocation_groups(id) ON DELETE CASCADE,
    PRIMARY KEY(portfolio_id, other_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_allocation_other_assignments_group ON allocation_other_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_allocation_other_assignments_asset ON allocation_other_assignments(other_asset_id);
