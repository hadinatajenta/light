ALTER TABLE posts ADD COLUMN review_stage TEXT;

UPDATE posts SET review_stage = 'fact_check_passed' WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_posts_review_stage ON posts (status, review_stage);
