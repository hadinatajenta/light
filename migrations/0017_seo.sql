ALTER TABLE posts ADD COLUMN target_intent TEXT;
ALTER TABLE topics ADD COLUMN intent TEXT;

CREATE TABLE IF NOT EXISTS seo_link_checks (
  url TEXT PRIMARY KEY,
  status_code INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  checked_at TEXT NOT NULL
);
