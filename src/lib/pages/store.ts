import { ApiError } from '../errors';

export type PageStatus = 'draft' | 'published';

export interface PageRecord {
  id: string;
  title: string;
  description: string;
  body: string;
  status: PageStatus;
  seoTitle: string | null;
  canonical: string | null;
  noindex: boolean;
  showInFooter: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageInput {
  id: string;
  title: string;
  description: string;
  body: string;
  status: PageStatus;
  seoTitle: string | null;
  canonical: string | null;
  noindex: boolean;
  showInFooter: boolean;
  sortOrder: number;
}

interface PageRow {
  id: string;
  title: string;
  description: string;
  body: string;
  status: string;
  seo_title: string | null;
  canonical: string | null;
  noindex: number;
  show_in_footer: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const PAGE_COLUMNS =
  'id, title, description, body, status, seo_title, canonical, noindex, show_in_footer, sort_order, created_at, updated_at';

function toStatus(value: string): PageStatus {
  return value === 'draft' ? 'draft' : 'published';
}

function toPage(row: PageRow): PageRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body,
    status: toStatus(row.status),
    seoTitle: row.seo_title,
    canonical: row.canonical,
    noindex: row.noindex === 1,
    showInFooter: row.show_in_footer === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findPageRow(db: D1Database, id: string): Promise<PageRow | null> {
  return db.prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`).bind(id).first<PageRow>();
}

export async function listPages(db: D1Database): Promise<PageRecord[]> {
  const result = await db
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages ORDER BY sort_order ASC, title ASC`)
    .all<PageRow>();

  return (result.results ?? []).map(toPage);
}

export async function listPublishedPages(db: D1Database): Promise<PageRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE status = 'published' ORDER BY sort_order ASC, title ASC`,
    )
    .all<PageRow>();

  return (result.results ?? []).map(toPage);
}

export async function listFooterPages(db: D1Database): Promise<PageRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE status = 'published' AND show_in_footer = 1 ORDER BY sort_order ASC, title ASC`,
    )
    .all<PageRow>();

  return (result.results ?? []).map(toPage);
}

export async function getPage(db: D1Database, id: string): Promise<PageRecord> {
  const row = await findPageRow(db, id);
  if (!row) {
    throw new ApiError(404, 'PAGE_NOT_FOUND', 'That page does not exist.');
  }

  return toPage(row);
}

export async function getPublishedPage(db: D1Database, id: string): Promise<PageRecord | null> {
  const row = await db
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ? AND status = 'published'`)
    .bind(id)
    .first<PageRow>();

  return row ? toPage(row) : null;
}

export async function createPage(db: D1Database, input: PageInput): Promise<PageRecord> {
  const existing = await db.prepare('SELECT id FROM pages WHERE id = ?').bind(input.id).first();
  if (existing) {
    throw new ApiError(409, 'PAGE_EXISTS', 'A page with that slug already exists.');
  }

  const now = new Date().toISOString();

  await db
    .prepare(`INSERT INTO pages (${PAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      input.id,
      input.title,
      input.description,
      input.body,
      input.status,
      input.seoTitle,
      input.canonical,
      input.noindex ? 1 : 0,
      input.showInFooter ? 1 : 0,
      input.sortOrder,
      now,
      now,
    )
    .run();

  return getPage(db, input.id);
}

export async function updatePage(
  db: D1Database,
  id: string,
  input: PageInput,
): Promise<PageRecord> {
  await getPage(db, id);

  if (input.id !== id) {
    const taken = await db.prepare('SELECT id FROM pages WHERE id = ?').bind(input.id).first();
    if (taken) {
      throw new ApiError(409, 'PAGE_EXISTS', 'A page with that slug already exists.');
    }
  }

  await db
    .prepare(
      `UPDATE pages SET id = ?, title = ?, description = ?, body = ?, status = ?, seo_title = ?,
        canonical = ?, noindex = ?, show_in_footer = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.id,
      input.title,
      input.description,
      input.body,
      input.status,
      input.seoTitle,
      input.canonical,
      input.noindex ? 1 : 0,
      input.showInFooter ? 1 : 0,
      input.sortOrder,
      new Date().toISOString(),
      id,
    )
    .run();

  return getPage(db, input.id);
}

export async function deletePage(db: D1Database, id: string): Promise<void> {
  await getPage(db, id);
  await db.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
}
