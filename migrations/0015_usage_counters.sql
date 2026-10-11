CREATE TABLE IF NOT EXISTS usage_counters (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, kind)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_kind_day ON usage_counters (kind, day);
