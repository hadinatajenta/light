CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  event TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata TEXT,
  actor_label TEXT,
  run_id TEXT,
  dedupe_key TEXT,
  push_status TEXT NOT NULL DEFAULT 'skipped',
  push_channel TEXT,
  push_error TEXT,
  push_attempts INTEGER NOT NULL DEFAULT 0,
  pushed_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_push ON notifications (push_status, push_attempts, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications (dedupe_key, created_at DESC);
