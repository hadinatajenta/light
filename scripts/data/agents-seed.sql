INSERT OR IGNORE INTO agents (id, name, role, prompt, model, runs_per_day, enabled, auto_publish, last_run_at, next_run_at, created_at, updated_at) VALUES
  (
    'agent-writer-a',
    'Writer A',
    'writer',
    'Monitors, desk setup, and chairs. Prioritise workspace constraints, comfort, and long-term value.',
    'deepseek-flash',
    24,
    1,
    0,
    NULL,
    datetime('now'),
    datetime('now'),
    datetime('now')
  ),
  (
    'agent-writer-b',
    'Writer B',
    'writer',
    'Keyboards, audio, and desk accessories. Prioritise typing comfort, durability, and quiet operation.',
    'deepseek-flash',
    24,
    1,
    0,
    NULL,
    datetime('now'),
    datetime('now'),
    datetime('now')
  ),
  (
    'agent-reviewer',
    'Reviewer',
    'reviewer',
    'Strict editor. Reject unsupported claims, invented specifications, thin structure, and any recommendation that does not explain who it suits.',
    'deepseek-flash',
    24,
    1,
    1,
    NULL,
    datetime('now'),
    datetime('now'),
    datetime('now')
  );
