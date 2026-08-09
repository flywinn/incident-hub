-- @ensure-column users username TEXT
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
  ON users(username COLLATE NOCASE)
  WHERE username IS NOT NULL AND username <> '';
