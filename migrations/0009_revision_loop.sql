ALTER TABLE posts ADD COLUMN review_notes TEXT;
ALTER TABLE posts ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_review ON posts (review_status, revision_count);
