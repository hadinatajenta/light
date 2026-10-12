CREATE TABLE IF NOT EXISTS post_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  post_id TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, path)
);

CREATE INDEX IF NOT EXISTS idx_post_views_day ON post_views (day);
CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views (post_id, day);
