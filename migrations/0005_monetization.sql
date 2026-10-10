ALTER TABLE affiliate_products ADD COLUMN topics TEXT NOT NULL DEFAULT '[]';
ALTER TABLE affiliate_products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE affiliate_products ADD COLUMN last_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_affiliate_products_active ON affiliate_products (is_active);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_program ON affiliate_products (program_id);

CREATE TABLE IF NOT EXISTS clicks (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  post_id TEXT,
  path TEXT NOT NULL,
  referrer TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clicks_product ON clicks (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_created ON clicks (created_at DESC);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES (
  'ads_config',
  '{"network":"none","adsenseClientId":null,"slots":{},"adsTxt":""}',
  datetime('now')
);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES (
  'affiliate_disclosure',
  'This article contains affiliate links. If you buy through them, we may earn a commission at no extra cost to you.',
  datetime('now')
);
