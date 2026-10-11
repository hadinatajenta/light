ALTER TABLE sources ADD COLUMN url TEXT;
ALTER TABLE sources ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN quote TEXT;
ALTER TABLE sources ADD COLUMN accessed_at TEXT;
ALTER TABLE sources ADD COLUMN source_type TEXT;
ALTER TABLE sources ADD COLUMN angle TEXT;

CREATE TABLE IF NOT EXISTS research_pages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  query TEXT,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  origin TEXT NOT NULL DEFAULT 'search',
  fetched_text TEXT,
  created_at TEXT NOT NULL,
  fetched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_pages_topic ON research_pages (topic_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_pages_topic_url ON research_pages (topic_id, url);
