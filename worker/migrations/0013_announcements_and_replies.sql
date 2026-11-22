-- Announcements and feedback replies, ported from nwk2/haven.
--
-- announcements: a short message the admin schedules (show from / until,
-- epoch ms). /api/me returns the one active right now and Home shows it
-- as a banner for everyone. No per-user dismiss; it ends when it ends.
--
-- feedback_messages: replies on a feedback item. The original message
-- stays in feedback.message; this table holds what comes after it, from
-- the admin ("admin") or the sender ("user"). feedback.user_unread is set
-- when the admin replies and cleared when the sender opens the thread.
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('user','admin')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread ON feedback_messages(feedback_id, created_at);

ALTER TABLE feedback ADD COLUMN user_unread INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, updated_at);
