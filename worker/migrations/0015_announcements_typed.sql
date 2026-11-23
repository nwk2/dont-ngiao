-- Announcements v2, ported from nwk2/haven (migration 0007 there): typed,
-- titled, optionally dismissible. Several can be live at once; Home stacks
-- them, most urgent first. A dismissal is per person and per announcement,
-- so it holds on every device and never comes back (unless the admin edits
-- it with "show it again", which clears the dismissals).
ALTER TABLE announcements ADD COLUMN kind TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('info', 'warn', 'ok'));
ALTER TABLE announcements ADD COLUMN title TEXT;
ALTER TABLE announcements ADD COLUMN dismissible INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS announcement_dismissals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, announcement_id)
);
