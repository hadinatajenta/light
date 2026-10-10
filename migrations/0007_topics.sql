CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  assigned_agent_id TEXT,
  used_post_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics (status, created_at);
