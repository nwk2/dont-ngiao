-- Don't Ngiao — migration 0005: admin + password resets (Nov 2026)
--
-- Admin is a SEPARATE user, logging in via a SEPARATE page (the regular
-- login page never grants admin). is_admin marks that account; every
-- admin endpoint checks it server-side, never just by hiding UI.
-- Bootstrap (run this migration first, in the D1 console):
--   1. Register the admin account through the regular register flow
--      (so its password hash is created normally).
--   2. UPDATE users SET is_admin=1 WHERE email='admin-email-here';
--   3. Log in at the frontend with ?admin in the URL.
--
-- password_resets stores reset LINK tokens for the manual flow:
-- admin clicks Reset in the admin Users module, gets a link, and sends
-- it to the user himself (WhatsApp, etc.) — no email provider is
-- integrated, and the admin never knows the user's new password.
-- Only the SHA-256 hash of the token is stored, never the plain token,
-- so a database leak alone gives no usable reset links. A token is
-- single-use (deleted on successful use, and deleted when a newer
-- token is generated for the same user) and expires after 24 hours.
-- The 24h expiry is enforced in code (expires_at, ISO timestamp),
-- not by the database.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_admin_id TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
