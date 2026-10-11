ALTER TABLE activity ADD COLUMN run_id TEXT;
ALTER TABLE activity ADD COLUMN metadata TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_target ON activity (target_type, target_id, created_at DESC);
