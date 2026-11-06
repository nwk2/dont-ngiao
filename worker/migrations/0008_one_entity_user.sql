-- Don't Ngiao — migration 0008: one-entity User (Nov 2026)
--
-- Combine User (account) + Member (group participant) into a single
-- users entity. A member IS a user; the name shown in a group is
-- users.name (the account name). A placeholder is a user row with no
-- password yet — it can't log in until it registers, which sets the
-- password on the SAME row, so the name syncs to the account name.
-- Manual 'Add member' is only for placeholders.
--
-- WHY NO TABLE RECREATION (v2, after v1 failed in D1): the 12-step
-- SQLite table-rebuild needs PRAGMA foreign_keys=OFF, which is a no-op
-- inside D1's batch (D1 runs the batch in a transaction), and with FKs
-- ON, DROP TABLE on a parent table (users, group_members) fails with
-- "FOREIGN KEY constraint failed" — verified locally 2026-11-06. So
-- this migration uses only ALTER / INSERT / UPDATE / CREATE INDEX,
-- which D1 accepts with FKs ON. Consequences, all handled in code:
--   * users.email / password_salt / password_hash stay NOT NULL, so a
--     placeholder user row uses SENTINEL values instead of NULL:
--       password_salt = '', password_hash = ''  (empty = no password)
--       email = their real email, or
--         'placeholder-<member id>@placeholder.invalid' when they have
--         none. The worker maps that sentinel email back to NULL in
--         API responses, so the app never shows it (a placeholder with
--         no real email reads as "No email set").
--     Placeholder-ness in code is therefore "password_hash is empty"
--     (JS: !password_hash; SQL: password_hash <> ''), never IS NULL.
--   * group_members.name is dropped (ALTER TABLE DROP COLUMN works).
--     group_members.email is KEPT but dead: the UNIQUE(group_id, email)
--     table constraint prevents dropping it without a table rebuild,
--     so the column stays with its stale values and the code never
--     reads or writes it. A UNIQUE index on (group_id, user_id) now
--     enforces one membership per user per group.
--   * group_members.user_id stays nullable in the schema (SQLite can't
--     change NOT NULL via ALTER). The code always sets it — every
--     member has a user since this migration — so the invariant holds
--     by code, not by the database.
--
-- Data (checked 2026-11-06): every placeholder (user_id IS NULL) gets
-- a users row (id 'ph-' || the member id) and the member row is pointed
-- at it. Account members keep their user_id; their per-group name
-- snapshot is discarded and users.name becomes the name everywhere
-- (3 snapshots differ from the account name — all Wai/Lucas: 'Wk' in
-- test 2, 'Waikit' in Osaka + KL 2026 — those groups now show 'Lucas').
--
-- Apply BEFORE the code that uses the new schema goes live (the old
-- code reads group_members.name and treats user_id NULL as placeholder,
-- both of which this migration removes). Verify with
-- PRAGMA foreign_key_check after applying (run separately).

-- 1. Placeholder user rows (sentinel password = '', sentinel email when
--    the placeholder has no real email).
INSERT INTO users (id, name, email, password_salt, password_hash, created_at, is_admin)
  SELECT 'ph-' || id, name, COALESCE(email, 'placeholder-' || id || '@placeholder.invalid'), '', '', created_at, 0
  FROM group_members WHERE user_id IS NULL;
-- 2. Point placeholder member rows at their new user rows.
UPDATE group_members SET user_id = 'ph-' || id WHERE user_id IS NULL;
-- 3. Drop the per-group name snapshot (the name now comes from users).
ALTER TABLE group_members DROP COLUMN name;
-- 4. One membership per user per group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_group_user ON group_members(group_id, user_id);
-- 5. The index on the (now dead) group_members.email column is useless.
DROP INDEX IF EXISTS idx_members_email;
