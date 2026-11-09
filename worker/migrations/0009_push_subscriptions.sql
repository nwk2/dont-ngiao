-- Don't Ngiao — migration 0009: push subscriptions (Nov 2026)
--
-- One row per device/browser that a user enables notifications on. The
-- browser generates the subscription (endpoint + p256dh/auth keys) when
-- the user opts in; the Worker sends an encrypted Web Push to each
-- endpoint when a money event happens in a group that user is in.
-- A user may have several rows (phone + desktop). The endpoint is the
-- natural unique key (one per device subscription). Presence of a row
-- IS the opt-in: turning notifications off deletes the row(s), so no
-- separate enabled flag is needed. Subscriptions are dropped when the
-- push service reports them gone (404/410). ON DELETE CASCADE on
-- user_id so deleting a user cleans up their devices.
-- Apply BEFORE the code that uses these endpoints goes live.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
