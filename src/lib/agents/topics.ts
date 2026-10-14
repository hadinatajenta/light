import { ApiError } from '../errors';

export const TOPIC_STATUSES = [
  'queued',
  'fetched',
  'researched',
  'in_progress',
  'used',
  'blocked',
  'dead',
] as const;

export const TOPIC_INTENTS = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
] as const;

export const MAX_TOPIC_ATTEMPTS = 3;

export const MAX_UNCLAIMED_TOPICS = 24;

const TOPIC_RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000];

const UNCLAIMABLE_TOPIC_STATUSES: readonly TopicStatus[] = [
  'in_progress',
  'used',
  'blocked',
  'dead',
];

export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface TopicRecord {
  id: string;
  title: string;
  keywords: string[];
  category: string | null;
  intent: string | null;
  status: TopicStatus;
  assignedAgentId: string | null;
  usedPostId: string | null;
  createdByAgentId: string | null;
  note: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TopicInput {
  title: string;
  keywords: string[];
  category: string | null;
  intent: string | null;
}

export interface TopicCounts {
  queued: number;
  fetched: number;
  researched: number;
  inProgress: number;
  used: number;
  blocked: number;
  dead: number;
}

interface TopicRow {
  id: string;
  title: string;
  keywords: string;
  category: string | null;
  intent: string | null;
  status: string;
  assigned_agent_id: string | null;
  used_post_id: string | null;
  created_by_agent_id: string | null;
  note: string | null;
  attempts: number;
  next_attempt_at: string | null;
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

export function topicRetryDelayMs(attempts: number): number | null {
  if (attempts < 1 || attempts >= MAX_TOPIC_ATTEMPTS) {
    return null;
  }

  return TOPIC_RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export function isTopicClaimable(
  status: TopicStatus,
  nextAttemptAt: string | null,
  nowIso: string,
): boolean {
  if (UNCLAIMABLE_TOPIC_STATUSES.includes(status)) {
    return false;
  }

  return nextAttemptAt === null || nextAttemptAt <= nowIso;
}

export function normalizeTopicTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDuplicateTopicTitle(candidate: string, known: readonly string[]): boolean {
  const normalizedCandidate = normalizeTopicTitle(candidate);

  if (!normalizedCandidate) {
    return false;
  }

  return known.some((title) => normalizeTopicTitle(title) === normalizedCandidate);
}

function toTopic(row: TopicRow): TopicRecord {
  return {
    id: row.id,
    title: row.title,
    keywords: readKeywords(row.keywords),
    category: row.category,
    intent: row.intent,
    status: readStatus(row.status),
    assignedAgentId: row.assigned_agent_id,
    usedPostId: row.used_post_id,
    createdByAgentId: row.created_by_agent_id ?? null,
    note: row.note,
    attempts: row.attempts ?? 0,
    nextAttemptAt: row.next_attempt_at ?? null,
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
    dead: 0,
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
    } else if (row.status === 'dead') {
      counts.dead = row.total;
    }
  }

  return counts;
}

export async function createTopic(
  db: D1Database,
  input: TopicInput,
  createdByAgentId: string | null = null,
): Promise<TopicRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO topics (id, title, keywords, category, intent, status, assigned_agent_id, used_post_id, created_by_agent_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', NULL, NULL, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.title,
      JSON.stringify(input.keywords),
      input.category,
      input.intent,
      createdByAgentId,
      now,
      now,
    )
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

export async function setTopicIntent(
  db: D1Database,
  id: string,
  intent: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE topics SET intent = ?, updated_at = ? WHERE id = ?')
    .bind(intent, new Date().toISOString(), id)
    .run();
}

export function buildCategoryFilter(categories: readonly string[]): {
  clause: string;
  bindings: string[];
} {
  if (categories.length === 0) {
    return { clause: '', bindings: [] };
  }

  const placeholders = categories.map(() => '?').join(', ');

  return { clause: ` AND category IN (${placeholders})`, bindings: [...categories] };
}

export function countUnclaimedTopics(counts: TopicCounts): number {
  return counts.queued + counts.fetched + counts.researched;
}

export function isTopicQueueFull(counts: TopicCounts): boolean {
  return countUnclaimedTopics(counts) > MAX_UNCLAIMED_TOPICS;
}

async function claimTopicWithStatus(
  db: D1Database,
  agentId: string,
  statuses: TopicStatus[],
  categories: readonly string[] = [],
): Promise<TopicRecord | null> {
  const nowIso = new Date().toISOString();
  const placeholders = statuses.map(() => '?').join(', ');
  const filter = buildCategoryFilter(categories);
  const candidate = await db
    .prepare(
      `SELECT id, status, next_attempt_at FROM topics
       WHERE status IN (${placeholders}) AND (next_attempt_at IS NULL OR next_attempt_at <= ?)${filter.clause}
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(...statuses, nowIso, ...filter.bindings)
    .first<{ id: string; status: string; next_attempt_at: string | null }>();

  if (
    !candidate ||
    !isTopicClaimable(readStatus(candidate.status), candidate.next_attempt_at, nowIso)
  ) {
    return null;
  }

  const result = await db
    .prepare(
      `UPDATE topics SET status = 'in_progress', assigned_agent_id = ?, updated_at = ?
       WHERE id = ? AND status = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)${filter.clause}`,
    )
    .bind(agentId, nowIso, candidate.id, candidate.status, nowIso, ...filter.bindings)
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
  return claimTopicWithStatus(db, agentId, ['queued', 'fetched'], []);
}

export function claimTopicForWriter(
  db: D1Database,
  agentId: string,
  categories: readonly string[],
): Promise<TopicRecord | null> {
  return claimTopicWithStatus(db, agentId, ['researched'], categories);
}

export async function markTopicResearched(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE topics SET status = 'researched', assigned_agent_id = NULL, attempts = 0,
        next_attempt_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .bind(new Date().toISOString(), id)
    .run();
}

export async function markTopicFetched(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE topics SET status = 'fetched', assigned_agent_id = NULL, attempts = 0,
        next_attempt_at = NULL, updated_at = ? WHERE id = ?`,
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
    .prepare(
      `UPDATE topics SET status = 'used', used_post_id = ?, attempts = 0, next_attempt_at = NULL,
        updated_at = ? WHERE id = ?`,
    )
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

export async function recordTopicFailure(
  db: D1Database,
  id: string,
  note: string,
  resumeStatus: TopicStatus,
): Promise<void> {
  const topic = await getTopic(db, id);
  const attempts = topic.attempts + 1;
  const now = new Date();
  const nowIso = now.toISOString();
  const retryDelay = topicRetryDelayMs(attempts);

  if (retryDelay === null) {
    await db
      .prepare(
        `UPDATE topics SET status = 'dead', attempts = ?, assigned_agent_id = NULL,
          next_attempt_at = NULL, note = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(attempts, note, nowIso, id)
      .run();
    return;
  }

  await db
    .prepare(
      `UPDATE topics SET status = ?, attempts = ?, assigned_agent_id = NULL,
        next_attempt_at = ?, note = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      resumeStatus,
      attempts,
      new Date(now.getTime() + retryDelay).toISOString(),
      note,
      nowIso,
      id,
    )
    .run();
}

export async function deleteTopic(db: D1Database, id: string): Promise<void> {
  await getTopic(db, id);
  await db.prepare('DELETE FROM topics WHERE id = ?').bind(id).run();
}
