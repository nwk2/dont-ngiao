-- Don't Ngiao — D1 schema (SQLite)
-- Money is integer minor units, except zero-decimal currencies (JPY, KRW, VND)
-- which are stored in whole units. Balances are always per currency, never converted.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'SGD',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, email)
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by_member_id TEXT NOT NULL REFERENCES group_members(id),
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS expense_splits (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES group_members(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  UNIQUE(expense_id, member_id)
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member_id TEXT NOT NULL REFERENCES group_members(id),
  to_member_id TEXT NOT NULL REFERENCES group_members(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_payments_group ON payments(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_group ON activity_log(group_id, created_at DESC);
