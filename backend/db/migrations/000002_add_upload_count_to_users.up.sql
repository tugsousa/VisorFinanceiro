-- 000002_add_upload_count_to_users.up.sql
ALTER TABLE users ADD COLUMN upload_count INTEGER DEFAULT 0;