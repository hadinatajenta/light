import { ApiError } from '../errors';

export const TOPIC_STATUSES = [
  'queued',
  'fetched',
  'researched',
  'in_progress',
  'used',
  'blocked',
] as const;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface TopicRecord {
  id: string;
  title: string;
  keywords: string[];
  category: string | null;
  status: TopicStatus;
  assignedAgentId: string | null;
  usedPostId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TopicInput {
  title: string;
  keywords: string[];
  category: string | null;
}

export interface TopicCounts {
  queued: number;
  fetched: number;
  researched: number;
  inProgress: number;
  used: number;
  blocked: number;
}

interface TopicRow {
  id: string;
  title: string;
  keywords: string;
  category: string | null;
  status: string;
  assigned_agent_id: string | null;
  used_post_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function readKeywords(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function readStatus(value: string): TopicStatus {
  return (TOPIC_STATUSES as readonly string[]).includes(value) ? (value as TopicStatus) : 'queued';
}

function toTopic(row: TopicRow): TopicRecord {
  return {
    id: row.id,
    title: row.title,
    keywords: readKeywords(row.keywords),
    category: row.category,
    status: readStatus(row.status),
    assignedAgentId: row.assigned_agent_id,
    usedPostId: row.used_post_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTopics(
  db: D1Database,
  options: { status?: TopicStatus; limit?: number } = {},
): Promise<TopicRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const condition = options.status ? 'WHERE status = ?' : '';
  const statement = db.prepare(`SELECT * FROM topics ${condition} ORDER BY created_at ASC LIMIT ?`);

  const result = options.status
    ? await statement.bind(options.status, limit).all<TopicRow>()
    : await statement.bind(limit).all<TopicRow>();

  return (result.results ?? []).map(toTopic);
}

export async function countTopics(db: D1Database): Promise<TopicCounts> {
  const result = await db
    .prepare('SELECT status, COUNT(*) AS total FROM topics GROUP BY status')
    .all<{ status: string; total: number }>();

  const counts: TopicCounts = {
    queued: 0,
    fetched: 0,
    researched: 0,
    inProgress: 0,
    used: 0,
    blocked: 0,
  };

  for (const row of result.results ?? []) {
    if (row.status === 'queued') {
      counts.queued = row.total;
    } else if (row.status === 'fetched') {
      counts.fetched = row.total;
    } else if (row.status === 'researched') {
      counts.researched = row.total;
    } else if (row.status === 'in_progress') {
      counts.inProgress = row.total;
    } else if (row.status === 'used') {
      counts.used = row.total;
    } else if (row.status === 'blocked') {
      counts.blocked = row.total;
    }
  }

  return counts;
}

export async function createTopic(db: D1Database, input: TopicInput): Promise<TopicRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO topics (id, title, keywords, category, status, assigned_agent_id, used_post_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', NULL, NULL, NULL, ?, ?)`,
    )
    .bind(id, input.title, JSON.stringify(input.keywords), input.category, now, now)
    .run();

  return getTopic(db, id);
}

export async function getTopic(db: D1Database, id: string): Promise<TopicRecord> {
  const row = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(id).first<TopicRow>();
  if (!row) {
    throw new ApiError(404, 'TOPIC_NOT_FOUND', 'That topic does not exist.');
  }

  return toTopic(row);
}

async function claimTopicWithStatus(
  db: D1Database,
  agentId: string,
  statuses: TopicStatus[],
): Promise<TopicRecord | null> {
  const placeholders = statuses.map(() => '?').join(', ');
  const candidate = await db
    .prepare(
      `SELECT id, status FROM topics WHERE status IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(...statuses)
    .first<{ id: string; status: string }>();

  if (!candidate) {
    return null;
  }

  const result = await db
    .prepare(
      `UPDATE topics SET status = 'in_progress', assigned_agent_id = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    )
    .bind(agentId, new Date().toISOString(), candidate.id, candidate.status)
    .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  if (changed !== 1) {
    return null;
  }

  return getTopic(db, candidate.id);
}

export function claimTopicForScrapper(
  db: D1Database,
  agentId: string,
): Promise<TopicRecord | null> {
  return claimTopicWithStatus(db, agentId, ['queued', 'fetched']);
}

export function claimTopicForWriter(db: D1Database, agentId: string): Promise<TopicRecord | null> {
  return claimTopicWithStatus(db, agentId, ['researched']);
}

export async function markTopicResearched(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE topics SET status = 'researched', assigned_agent_id = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), id)
    .run();
}

export async function markTopicFetched(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE topics SET status = 'fetched', assigned_agent_id = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), id)
    .run();
}

export async function scrapperResumeStatus(
  db: D1Database,
  topicId: string,
): Promise<'queued' | 'fetched'> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM research_pages WHERE topic_id = ?')
    .bind(topicId)
    .first<{ total: number }>();

  return (row?.total ?? 0) > 0 ? 'fetched' : 'queued';
}

export async function findTopicByPost(db: D1Database, postId: string): Promise<TopicRecord | null> {
  const row = await db
    .prepare('SELECT * FROM topics WHERE used_post_id = ? LIMIT 1')
    .bind(postId)
    .first<TopicRow>();

  return row ? toTopic(row) : null;
}

export async function markTopicUsed(db: D1Database, id: string, postId: string): Promise<void> {
  await db
    .prepare("UPDATE topics SET status = 'used', used_post_id = ?, updated_at = ? WHERE id = ?")
    .bind(postId, new Date().toISOString(), id)
    .run();
}

export async function releaseTopic(
  db: D1Database,
  id: string,
  note?: string,
  status: TopicStatus = 'queued',
): Promise<void> {
  await db
    .prepare(
      `UPDATE topics SET status = ?, assigned_agent_id = NULL, note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, note ?? null, new Date().toISOString(), id)
    .run();
}

export async function blockTopic(db: D1Database, id: string, note: string): Promise<void> {
  await db
    .prepare("UPDATE topics SET status = 'blocked', note = ?, updated_at = ? WHERE id = ?")
    .bind(note, new Date().toISOString(), id)
    .run();
}

export async function deleteTopic(db: D1Database, id: string): Promise<void> {
  await getTopic(db, id);
  await db.prepare('DELETE FROM topics WHERE id = ?').bind(id).run();
}
