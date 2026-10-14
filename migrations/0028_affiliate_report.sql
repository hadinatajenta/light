CREATE TABLE IF NOT EXISTS affiliate_earnings_reports (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_filename TEXT,
  imported_by TEXT,
  imported_at TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_earnings_reports_period
  ON affiliate_earnings_reports (network, period_start, period_end);

CREATE TABLE IF NOT EXISTS affiliate_earnings_lines (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  product_id TEXT,
  target TEXT NOT NULL,
  order_day TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  line_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_earnings_lines_hash
  ON affiliate_earnings_lines (line_hash);

CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_lines_product
  ON affiliate_earnings_lines (product_id, report_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_lines_day
  ON affiliate_earnings_lines (order_day);
