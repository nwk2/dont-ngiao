-- Don't Ngiao — migration 0006: activity log member ids (Nov 2026)
--
-- The Log is a PAYMENT audit log (expenses + settles), not an
-- all-activity log. Its rows used to identify people by name strings
-- (actor_name, and "X -> Y" in detail), so a member rename left stale
-- names in old entries, and the actor showed the ACCOUNT name while
-- every other view shows the MEMBER name.
-- These columns make the member id the identity, like everywhere else
-- (expenses, splits, payments, balances): names are resolved live at
-- read time, so a rename relabels the log. actor_name/detail stay as
-- fallback for rows written before this migration (ids NULL) and for
-- rows whose member is gone.
-- Apply BEFORE the code that writes these columns goes live: the new
-- log writes reference them on every expense/payment, so a worker
-- rebuilt before this migration is applied will fail those writes.
ALTER TABLE activity_log ADD COLUMN actor_member_id TEXT;
ALTER TABLE activity_log ADD COLUMN from_member_id TEXT;
ALTER TABLE activity_log ADD COLUMN to_member_id TEXT;
