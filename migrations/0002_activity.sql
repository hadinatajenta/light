CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity (actor_id, created_at DESC);

ALTER TABLE categories ADD COLUMN created_at TEXT;
