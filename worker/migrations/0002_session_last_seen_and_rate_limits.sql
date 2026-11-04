-- Don't Ngiao — migration 0002: sliding session expiry + rate limiting.
-- Apply once in the D1 console (same as 0001 was applied).
-- If re-applied, the ALTER TABLE will error because sessions.last_seen_at
-- already exists — that single error can be ignored; the CREATE TABLE and
-- CREATE INDEX statements below are idempotent (IF NOT EXISTS).
-- IMPORTANT: the worker code is written to work BEFORE this migration is
-- applied (it falls back to created_at age for expiry and fails open on
-- rate limits), and sliding expiry + rate-limit enforcement only take
-- effect AFTER this migration is applied and the API Worker is rebuilt.
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits ON rate_limits (kind, key, created_ms);
