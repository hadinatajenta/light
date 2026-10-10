export type ActorType = 'user' | 'agent';

export interface ActivityEvent {
  actorId: string;
  actorType: ActorType;
  actorLabel: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
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
  limit?: number;
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
      `INSERT INTO activity (id, actor_id, actor_type, actor_label, action, target_type, target_id, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
    )
    .run();
}

export async function listActivity(
  db: D1Database,
  query: ActivityQuery = {},
): Promise<ActivityEntry[]> {
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

  const result = await db
    .prepare(`SELECT * FROM activity ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings, limit)
    .all<ActivityRow>();

  return (result.results ?? []).map(toEntry);
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
