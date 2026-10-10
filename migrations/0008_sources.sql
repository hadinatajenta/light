CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  agent_id TEXT,
  kind TEXT NOT NULL DEFAULT 'note',
  heading TEXT NOT NULL,
  detail TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_topic ON sources (topic_id, created_at);
