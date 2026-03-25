-- Drop the failed_isins table and its index
DROP INDEX IF EXISTS idx_failed_isins_last_failed;
DROP TABLE IF EXISTS failed_isins;