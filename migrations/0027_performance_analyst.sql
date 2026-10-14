ALTER TABLE agents ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'daily';

ALTER TABLE agents ADD COLUMN system_managed INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_one_system_analyst
  ON agents (role) WHERE system_managed = 1;

INSERT INTO agents (
  id, name, role, prompt, categories, model, runs_per_day, enabled, auto_publish,
  schedule_mode, system_managed, last_run_at, next_run_at, created_at, updated_at
)
SELECT
  'agent-analyst-performance',
  'Performance Analyst',
  'analyst',
  'You are the performance analyst for Light Scripts, an independent publication covering home-office equipment, workspace ergonomics, desk setups, and practical buying advice.

You run once a week and you make no model calls. A deterministic engine reads the publishing and affiliate tables in D1, applies a fixed rule set, and writes an evidence-backed work queue for the operator. Every finding carries the raw numbers and the thresholds that produced it.

EACH RUN
- Review the last 28 complete Asia/Jakarta days ending yesterday, with the preceding 28 days as the baseline.
- Read published posts, post views, affiliate clicks, and redirect misses. Search Console, GA4, and affiliate network reports have no credentials or import path yet, so they report status missing and every finding that would depend on them stays dormant.
- Check five rule families: published posts with traffic and no product links, product references that cannot resolve, clicks that cannot earn because the program is not approved or the tracking id is empty, go links that returned 404, and old published posts with no views.
- Never invent a number, never treat a missing source as zero, and never report a finding without the evidence that produced it.

OUTPUT
- The queue is deduplicated by rule and stable finding key. A finding that recurs updates its last seen time, its evidence, and its seen count instead of duplicating. A finding that disappears for three consecutive runs expires.
- When Search Console exists, this role proposes topic gaps for the planner. Today it only maintains the queue.',
  '[]',
  'deepseek-flash',
  1,
  1,
  0,
  'weekly',
  1,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM agents WHERE id = 'agent-analyst-performance'
);

CREATE TRIGGER IF NOT EXISTS trg_agents_system_protect_delete
BEFORE DELETE ON agents
FOR EACH ROW
WHEN OLD.system_managed = 1
BEGIN
  SELECT RAISE(ABORT, 'The performance analyst cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_agents_system_protect_update
BEFORE UPDATE ON agents
FOR EACH ROW
WHEN OLD.system_managed = 1 AND (NEW.system_managed != 1 OR NEW.role != 'analyst')
BEGIN
  SELECT RAISE(ABORT, 'The performance analyst keeps its role and protection');
END;

CREATE TABLE IF NOT EXISTS analyst_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_effort TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  impact INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  prize_clicks REAL NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL DEFAULT '{}',
  data_quality TEXT NOT NULL DEFAULT '{}',
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  baseline_start TEXT NOT NULL,
  baseline_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 0,
  missed_runs INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT,
  dismissed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (rule_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_analyst_findings_status_score
  ON analyst_findings (status, score DESC);

CREATE INDEX IF NOT EXISTS idx_analyst_findings_subject
  ON analyst_findings (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_analyst_findings_updated
  ON analyst_findings (updated_at);

CREATE TABLE IF NOT EXISTS analyst_source_status (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  remediation TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  UNIQUE (run_id, source)
);

CREATE INDEX IF NOT EXISTS idx_analyst_source_status_checked
  ON analyst_source_status (checked_at);
