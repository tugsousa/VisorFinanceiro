-- Performance indexes for transaction queries and portfolio snapshots
-- These indexes dramatically speed up fetchUserProcessedTransactions and snapshot queries

-- 1. Composite index for the main transaction query
--    (covers the WHERE + ORDER BY in fetchUserProcessedTransactions)
CREATE INDEX IF NOT EXISTS idx_ptx_user_pf
  ON processed_transactions(user_id, portfolio_id, id);

-- 2. Composite index for portfolio_snapshots queries
CREATE INDEX IF NOT EXISTS idx_snapshots_user_pf_date
  ON portfolio_snapshots(user_id, portfolio_id, date);