CREATE TABLE IF NOT EXISTS affiliate_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  network TEXT NOT NULL,
  tracking_id TEXT,
  link_template TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  disclosure TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  program_id TEXT NOT NULL,
  target TEXT NOT NULL,
  price_amount REAL,
  price_currency TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_products_program ON affiliate_products (program_id);

INSERT OR IGNORE INTO affiliate_programs
  (id, name, network, tracking_id, link_template, status, disclosure, created_at, updated_at)
VALUES
  (
    'amazon',
    'Amazon Associates',
    'amazon',
    'lightscripts-20',
    'https://www.amazon.com/dp/{target}?tag={trackingId}',
    'approved',
    'As an Amazon Associate I earn from qualifying purchases.',
    datetime('now'),
    datetime('now')
  );
