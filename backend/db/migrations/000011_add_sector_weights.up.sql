-- Sector breakdown of a fund (ETF), as JSON {"Technology": 0.33, ...}, and when the metadata was last fetched.
ALTER TABLE isin_ticker_map ADD COLUMN sector_weights TEXT;
ALTER TABLE isin_ticker_map ADD COLUMN metadata_updated_at TIMESTAMP;
