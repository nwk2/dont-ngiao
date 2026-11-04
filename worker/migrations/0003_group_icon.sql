-- Group icon (single emoji, optional, nullable). Apply in the D1 console
-- BEFORE rebuilding the API Worker: the Worker INSERT/UPDATE statements
-- reference this column, so they fail with "no such column" until it exists.
-- Re-applying this file errors on the ALTER (column already exists) — that
-- one error is safe to ignore; there are no other statements to re-run.
ALTER TABLE groups ADD COLUMN icon TEXT;
