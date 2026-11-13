-- Don't Ngiao — migration 0011: feedback (Nov 2026)
--
-- In-app feedback from signed-in users (auth-only, no anonymous
-- submissions). One row per submission: the type (bug / idea /
-- question), the message, the group it relates to (NULL = general,
-- no group), the build the user was on when they sent it (NULL when
-- the frontend could not fetch version.json), and a triage status
-- (open / done) the admin flips from the Feedback module. The sender
-- is a user row; ON DELETE CASCADE so deleting a user cleans up their
-- feedback. group_id is SET NULL (not CASCADE) so deleting a group
-- keeps the feedback, just unlinked from the group.
-- Apply BEFORE the code that uses these endpoints goes live.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  build_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
