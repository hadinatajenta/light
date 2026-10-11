CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  window_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_state (
  key TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_finished_at ON agent_runs (finished_at);
