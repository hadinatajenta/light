CREATE TABLE clicks_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  post_id TEXT,
  path TEXT,
  referrer TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO clicks_rebuilt (id, product_id, post_id, path, referrer, created_at)
SELECT id, product_id, post_id, path, referrer, created_at FROM clicks;

DROP TABLE clicks;

ALTER TABLE clicks_rebuilt RENAME TO clicks;

CREATE INDEX idx_clicks_product ON clicks (product_id, created_at DESC);

CREATE INDEX idx_clicks_created ON clicks (created_at DESC);
