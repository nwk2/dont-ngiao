-- Don't Ngiao — migration 0007: group invite links (Nov 2026)
--
-- One invite link per group (UNIQUE group_id), multi-use, no expiry,
-- revocable (DELETE the row). The token is stored in PLAINTEXT, not
-- hashed like the admin reset tokens — deliberately: any member must be
-- able to view and copy the CURRENT link at any time, which is
-- impossible if only a hash is stored (the plain token is unrecoverable
-- from a hash). The token is 32 random bytes (256-bit, unguessable) and
-- revocable, and joining only creates a group membership, never account
-- access. created_by_member_id is a plain reference (no FK), like
-- activity_log's member columns — if the inviter leaves, it dangles
-- harmlessly and the name falls back to the account name.
-- Apply BEFORE the code that uses these endpoints goes live.
CREATE TABLE IF NOT EXISTS group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_by_member_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(group_id)
);
CREATE INDEX IF NOT EXISTS idx_invites_group ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON group_invites(token);
