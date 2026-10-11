export type ActorType = 'user' | 'agent';

export interface ActivityEvent {
  actorId: string;
  actorType: ActorType;
  actorLabel: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  runId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityEntry {
  id: string;
  actorId: string;
  actorType: ActorType;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  runId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActorSummary {
  id: string;
  type: ActorType;
  label: string;
  activityCount: number;
  lastActiveAt: string | null;
}

export interface ActivityQuery {
  actorId?: string;
  actorType?: ActorType;
  action?: string;
  targetType?: string;
  targetId?: string;
  runId?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface ActivityRow {
  id: string;
  actor_id: string;
  actor_type: string;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  run_id: string | null;
  metadata: string | null;
  created_at: string;
}

interface ActorRow {
  id: string;
  type: string;
  label: string;
  activity_count: number;
  last_active_at: string | null;
}

function readActorType(value: string): ActorType {
  return value === 'agent' ? 'agent' : 'user';
}

function readMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorType: readActorType(row.actor_type),
    actorLabel: row.actor_label,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    runId: row.run_id,
    metadata: readMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

export async function insertActivity(db: D1Database, event: ActivityEvent): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO actors (id, type, label, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET type = excluded.type, label = excluded.label`,
    )
    .bind(event.actorId, event.actorType, event.actorLabel, now)
    .run();

  await db
    .prepare(
      `INSERT INTO activity (id, actor_id, actor_type, actor_label, action, target_type, target_id, summary, run_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.actorId,
      event.actorType,
      event.actorLabel,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.summary,
      event.runId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      now,
    )
    .run();
}

const DEFAULT_ACTIVITY_LIMIT = 50;
const MAX_ACTIVITY_LIMIT = 200;

export interface ActivityFilter {
  where: string;
  bindings: unknown[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildActivityFilter(query: ActivityQuery): ActivityFilter {
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (query.actorId) {
    conditions.push('actor_id = ?');
    bindings.push(query.actorId);
  }

  if (query.actorType) {
    conditions.push('actor_type = ?');
    bindings.push(query.actorType);
  }

  if (query.action) {
    conditions.push('action = ?');
    bindings.push(query.action);
  }

  if (query.targetType) {
    conditions.push('target_type = ?');
    bindings.push(query.targetType);
  }

  if (query.targetId) {
    conditions.push('target_id = ?');
    bindings.push(query.targetId);
  }

  if (query.runId) {
    conditions.push('run_id = ?');
    bindings.push(query.runId);
  }

  if (query.since) {
    conditions.push('created_at >= ?');
    bindings.push(query.since);
  }

  if (query.until) {
    conditions.push('created_at <= ?');
    bindings.push(query.until);
  }

  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`;
    conditions.push("(summary LIKE ? ESCAPE '\\' OR actor_label LIKE ? ESCAPE '\\')");
    bindings.push(pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    bindings,
  };
}

function readFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function resolveActivityWindow(query: ActivityQuery): { limit: number; offset: number } {
  const limit = Math.trunc(readFiniteNumber(query.limit, DEFAULT_ACTIVITY_LIMIT));
  const offset = Math.trunc(readFiniteNumber(query.offset, 0));

  return {
    limit: Math.min(Math.max(limit, 1), MAX_ACTIVITY_LIMIT),
    offset: Math.max(offset, 0),
  };
}

export async function listActivity(
  db: D1Database,
  query: ActivityQuery = {},
): Promise<ActivityEntry[]> {
  const { where, bindings } = buildActivityFilter(query);
  const { limit, offset } = resolveActivityWindow(query);

  const result = await db
    .prepare(`SELECT * FROM activity ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, limit, offset)
    .all<ActivityRow>();

  return (result.results ?? []).map(toEntry);
}

export async function countActivity(db: D1Database, query: ActivityQuery = {}): Promise<number> {
  const { where, bindings } = buildActivityFilter(query);

  const row = await db
    .prepare(`SELECT COUNT(*) AS total FROM activity ${where}`)
    .bind(...bindings)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function listActivityActions(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT DISTINCT action FROM activity ORDER BY action ASC')
    .all<{ action: string }>();

  return (result.results ?? []).map((row) => row.action);
}

export async function listActors(db: D1Database): Promise<ActorSummary[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.type, a.label, COUNT(ac.id) AS activity_count, MAX(ac.created_at) AS last_active_at
       FROM actors a
       LEFT JOIN activity ac ON ac.actor_id = a.id
       GROUP BY a.id, a.type, a.label
       ORDER BY (last_active_at IS NULL), last_active_at DESC, a.label ASC`,
    )
    .all<ActorRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    type: readActorType(row.type),
    label: row.label,
    activityCount: row.activity_count,
    lastActiveAt: row.last_active_at,
  }));
}
