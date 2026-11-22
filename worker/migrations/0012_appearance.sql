-- Appearance, Haven-style: each account saves a theme and a mode, applied
-- on every device it signs in on. Values are checked in the Worker (PATCH
-- /api/me) rather than with a CHECK constraint, so adding a theme later
-- doesn't need another migration.
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'kopitiam';
ALTER TABLE users ADD COLUMN mode TEXT NOT NULL DEFAULT 'system';
