-- Don't Ngiao — migration 0004: missing indexes (medium performance fix, Nov 2026)
--
-- Why these three, and why they are safe to run at any time:
--   1. idx_members_user — GET /api/groups runs
--      SELECT group_id FROM group_members WHERE user_id=?
--      There was an index on group_id and a UNIQUE on (group_id, email),
--      but nothing on user_id alone, so that query full-scanned
--      group_members. As total members across all groups grows, Home
--      load slows even for a user with few groups.
--   2. idx_members_email — claimPlaceholders() on register/login runs
--      UPDATE group_members SET user_id=? WHERE email=? AND user_id IS NULL
--      That is a global (not group-scoped) email lookup, also unindexed.
--   3. idx_expenses_group_date — groupSummary() runs
--      SELECT * FROM expenses WHERE group_id=? ORDER BY date DESC, created_at DESC
--      The old idx_expenses_group (group_id only) finds the rows but
--      SQLite still has to sort them; the composite index serves the
--      filter AND the ordering.
--
-- No code change references these index names — SQLite's query planner
-- picks them up automatically — so this migration is independent of the
-- medium code fixes (batch writes, auth JOIN, lazy activity). It can be
-- applied before or after those code changes, with no Worker rebuild
-- needed after it. All statements are IF NOT EXISTS, so re-running the
-- whole file is a no-op, and it changes no data, only indexes.
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_email ON group_members(email);
CREATE INDEX IF NOT EXISTS idx_expenses_group_date ON expenses(group_id, date DESC, created_at DESC);
