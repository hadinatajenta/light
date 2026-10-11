import { ApiError } from '../errors';

export const RESEARCH_PAGE_STATUSES = ['discovered', 'fetched', 'failed'] as const;
export type ResearchPageStatus = (typeof RESEARCH_PAGE_STATUSES)[number];

export const RESEARCH_PAGE_ORIGINS = ['search', 'manual'] as const;
export type ResearchPageOrigin = (typeof RESEARCH_PAGE_ORIGINS)[number];

export interface ResearchPageRecord {
  id: string;
  topicId: string;
  query: string | null;
  url: string;
  title: string | null;
  snippet: string | null;
  status: ResearchPageStatus;
  origin: ResearchPageOrigin;
  fetchedText: string | null;
  createdAt: string;
  fetchedAt: string | null;
}

export interface ResearchPageInput {
  topicId: string;
  query: string | null;
  url: string;
  title: string | null;
  snippet: string | null;
  origin: ResearchPageOrigin;
}

export interface ResearchPageCounts {
  discovered: number;
  fetched: number;
  failed: number;
  total: number;
}

interface ResearchPageRow {
  id: string;
  topic_id: string;
  query: string | null;
  url: string;
  title: string | null;
  snippet: string | null;
  status: string;
  origin: string;
  fetched_text: string | null;
  created_at: string;
  fetched_at: string | null;
}

function readStatus(value: string): ResearchPageStatus {
  return (RESEARCH_PAGE_STATUSES as readonly string[]).includes(value)
    ? (value as ResearchPageStatus)
    : 'discovered';
}

function readOrigin(value: string): ResearchPageOrigin {
  return (RESEARCH_PAGE_ORIGINS as readonly string[]).includes(value)
    ? (value as ResearchPageOrigin)
    : 'search';
}

function toPage(row: ResearchPageRow): ResearchPageRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    query: row.query,
    url: row.url,
    title: row.title,
    snippet: row.snippet,
    status: readStatus(row.status),
    origin: readOrigin(row.origin),
    fetchedText: row.fetched_text,
    createdAt: row.created_at,
    fetchedAt: row.fetched_at,
  };
}

export async function listResearchPages(
  db: D1Database,
  topicId: string,
): Promise<ResearchPageRecord[]> {
  const result = await db
    .prepare('SELECT * FROM research_pages WHERE topic_id = ? ORDER BY created_at ASC')
    .bind(topicId)
    .all<ResearchPageRow>();

  return (result.results ?? []).map(toPage);
}

export async function insertResearchPage(db: D1Database, input: ResearchPageInput): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO research_pages
         (id, topic_id, query, url, title, snippet, status, origin, fetched_text, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, 'discovered', ?, NULL, ?, NULL)`,
    )
    .bind(
      crypto.randomUUID(),
      input.topicId,
      input.query,
      input.url,
      input.title,
      input.snippet,
      input.origin,
      new Date().toISOString(),
    )
    .run();
}

export async function markResearchPageFetched(
  db: D1Database,
  id: string,
  input: { title: string | null; text: string },
): Promise<void> {
  await db
    .prepare(
      "UPDATE research_pages SET status = 'fetched', title = ?, fetched_text = ?, fetched_at = ? WHERE id = ?",
    )
    .bind(input.title, input.text, new Date().toISOString(), id)
    .run();
}

export async function markResearchPageFailed(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE research_pages SET status = 'failed', fetched_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}

export async function deleteResearchPage(db: D1Database, id: string): Promise<void> {
  const row = await db.prepare('SELECT id FROM research_pages WHERE id = ?').bind(id).first();

  if (!row) {
    throw new ApiError(404, 'RESEARCH_PAGE_NOT_FOUND', 'That research page does not exist.');
  }

  await db.prepare('DELETE FROM research_pages WHERE id = ?').bind(id).run();
}

export function summarizeResearchPages(pages: ResearchPageRecord[]): ResearchPageCounts {
  const counts: ResearchPageCounts = { discovered: 0, fetched: 0, failed: 0, total: 0 };

  for (const page of pages) {
    counts.total += 1;
    if (page.status === 'fetched') {
      counts.fetched += 1;
    } else if (page.status === 'failed') {
      counts.failed += 1;
    } else {
      counts.discovered += 1;
    }
  }

  return counts;
}
