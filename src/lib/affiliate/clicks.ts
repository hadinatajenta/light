import { buildAffiliateUrl } from './links';
import { getProgram } from './store';

export interface ClickInput {
  productId: string;
  postId: string | null;
  path: string | null;
  referrer: string | null;
}

export interface ClickTotals {
  last24h: number;
  last7d: number;
  last30d: number;
  total: number;
}

export interface TopProduct {
  slug: string;
  name: string;
  clicks: number;
  lastClickAt: string | null;
}

export interface ClickTarget {
  productId: string;
  url: string;
}

export async function findClickTarget(db: D1Database, slug: string): Promise<ClickTarget | null> {
  const row = await db
    .prepare(
      `SELECT p.id, p.target, p.program_id, p.is_active
       FROM affiliate_products p
       WHERE p.slug = ?`,
    )
    .bind(slug)
    .first<{ id: string; target: string; program_id: string; is_active: number }>();

  if (row?.is_active !== 1) {
    return null;
  }

  const program = await getProgram(db, row.program_id).catch(() => null);
  if (!program) {
    return null;
  }

  const url = buildAffiliateUrl(program, row.target);
  if (!url) {
    return null;
  }

  return { productId: row.id, url };
}

export async function recordClick(db: D1Database, input: ClickInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO clicks (id, product_id, post_id, path, referrer, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.productId,
      input.postId,
      input.path,
      input.referrer,
      new Date().toISOString(),
    )
    .run();
}

function isoSince(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function countSince(db: D1Database, since: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM clicks WHERE created_at >= ?')
    .bind(since)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function readClickTotals(db: D1Database): Promise<ClickTotals> {
  const [last24h, last7d, last30d, total] = await Promise.all([
    countSince(db, isoSince(1)),
    countSince(db, isoSince(7)),
    countSince(db, isoSince(30)),
    countSince(db, isoSince(3650)),
  ]);

  return { last24h, last7d, last30d, total };
}

export async function readTopProducts(db: D1Database, limit = 8): Promise<TopProduct[]> {
  const result = await db
    .prepare(
      `SELECT p.slug AS slug, p.name AS name, COUNT(c.id) AS clicks, MAX(c.created_at) AS last_click_at
       FROM clicks c
       JOIN affiliate_products p ON p.id = c.product_id
       GROUP BY p.slug, p.name
       ORDER BY clicks DESC
       LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 50))
    .all<{ slug: string; name: string; clicks: number; last_click_at: string | null }>();

  return (result.results ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    clicks: row.clicks,
    lastClickAt: row.last_click_at,
  }));
}

export async function readClicksByDay(db: D1Database, days: number): Promise<number[]> {
  const buckets = Array.from({ length: days }, () => 0);
  const result = await db
    .prepare('SELECT created_at FROM clicks WHERE created_at >= ?')
    .bind(isoSince(days))
    .all<{ created_at: string }>();

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const row of result.results ?? []) {
    const time = new Date(row.created_at).getTime();
    if (Number.isNaN(time)) {
      continue;
    }

    const daysAgo = Math.floor((now - time) / dayMs);
    if (daysAgo < 0 || daysAgo >= days) {
      continue;
    }

    buckets[days - 1 - daysAgo] += 1;
  }

  return buckets;
}

export function readPostIdFromPath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const match = path.match(/^\/blog\/([a-z0-9-]+)\/?$/i);
  return match ? match[1] : null;
}
