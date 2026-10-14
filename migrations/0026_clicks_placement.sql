ALTER TABLE clicks ADD COLUMN placement TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_clicks_post_created ON clicks (post_id, created_at);

CREATE TABLE IF NOT EXISTS redirect_misses (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  referrer_path TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, slug, referrer_path)
);

CREATE INDEX IF NOT EXISTS idx_redirect_misses_day ON redirect_misses (day);
