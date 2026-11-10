-- Don't Ngiao — migration 0010: Google sign-in (Nov 2026)
--
-- google_sub = the Google account's stable user ID (the `sub` claim from
-- Google's userinfo endpoint). One Google account links to at most one
-- user (UNIQUE), and a user links to at most one Google account (a
-- single column). NULL = no Google account linked (email/password
-- users and placeholders). SQLite UNIQUE allows multiple NULLs, so
-- existing rows are unaffected.
-- Apply BEFORE the code that reads/writes google_sub goes live.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
