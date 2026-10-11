CREATE TABLE IF NOT EXISTS share_channels (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  daily_cap INTEGER,
  require_approval INTEGER NOT NULL DEFAULT 0,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  paused_until TEXT,
  started_at TEXT,
  last_error TEXT,
  last_success_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_outbox (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  rate_limit_hits INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  age_reset_at TEXT,
  locked_at TEXT,
  provider_post_id TEXT,
  shared_url TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_outbox_post_channel ON share_outbox (post_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_share_outbox_due ON share_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_share_outbox_post ON share_outbox (post_id);

ALTER TABLE posts ADD COLUMN published_at TEXT;

UPDATE posts SET published_at = COALESCE(pub_date, created_at)
WHERE status = 'published' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts (status, published_at);
