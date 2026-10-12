import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_LEVELS,
  NOTIFICATION_PUSH_STATUSES,
  type NotificationCategory,
  type NotificationEvent,
  type NotificationLevel,
  type NotificationListOptions,
  type NotificationPage,
  type NotificationPushStatus,
  type NotificationRecord,
} from './types';

export const NOTIFICATION_MAX_LIMIT = 50;
export const NOTIFICATION_DEFAULT_LIMIT = 20;
export const NOTIFICATION_RETRY_BATCH = 20;

const NOTIFICATION_COLUMNS = `id, level, category, event, title, body, link, metadata, actor_label,
  run_id, dedupe_key, push_status, push_channel, push_error, push_attempts, pushed_at, read_at, created_at`;

interface NotificationRow {
  id: string;
  level: string;
  category: string;
  event: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: string | null;
  actor_label: string | null;
  run_id: string | null;
  dedupe_key: string | null;
  push_status: string;
  push_channel: string | null;
  push_error: string | null;
  push_attempts: number;
  pushed_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInsert {
  id: string;
  level: NotificationLevel;
  category: NotificationCategory;
  event: NotificationEvent;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  actorLabel: string | null;
  runId: string | null;
  dedupeKey: string | null;
  createdAt: string;
}

export interface NotificationPushOutcome {
  status: NotificationPushStatus;
  channel: string | null;
  error: string | null;
  pushedAt: string | null;
}

function isLevel(value: string): value is NotificationLevel {
  return (NOTIFICATION_LEVELS as readonly string[]).includes(value);
}

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

function isEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

function isPushStatus(value: string): value is NotificationPushStatus {
  return (NOTIFICATION_PUSH_STATUSES as readonly string[]).includes(value);
}

function readMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    level: isLevel(row.level) ? row.level : 'info',
    category: isCategory(row.category) ? row.category : 'system',
    event: isEvent(row.event) ? row.event : 'agent.run.started',
    title: row.title,
    body: row.body,
    link: row.link,
    metadata: readMetadata(row.metadata),
    actorLabel: row.actor_label,
    runId: row.run_id,
    dedupeKey: row.dedupe_key,
    pushStatus: isPushStatus(row.push_status) ? row.push_status : 'skipped',
    pushChannel: row.push_channel,
    pushError: row.push_error,
    pushAttempts: row.push_attempts,
    pushedAt: row.pushed_at,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function encodeNotificationCursor(
  record: Pick<NotificationRecord, 'createdAt' | 'id'>,
): string {
  return `${record.createdAt}|${record.id}`;
}

export function decodeNotificationCursor(cursor: string): { createdAt: string; id: string } | null {
  const separatorIndex = cursor.indexOf('|');
  if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
    return null;
  }

  return {
    createdAt: cursor.slice(0, separatorIndex),
    id: cursor.slice(separatorIndex + 1),
  };
}

export function clampNotificationLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return NOTIFICATION_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), NOTIFICATION_MAX_LIMIT);
}

export async function insertNotification(
  db: D1Database,
  record: NotificationInsert,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications (id, level, category, event, title, body, link, metadata,
        actor_label, run_id, dedupe_key, push_status, push_channel, push_error, push_attempts,
        pushed_at, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'skipped', NULL, NULL, 0, NULL, NULL, ?)`,
    )
    .bind(
      record.id,
      record.level,
      record.category,
      record.event,
      record.title,
      record.body,
      record.link,
      record.metadata ? JSON.stringify(record.metadata) : null,
      record.actorLabel,
      record.runId,
      record.dedupeKey,
      record.createdAt,
    )
    .run();
}

export async function listNotifications(
  db: D1Database,
  options: NotificationListOptions,
): Promise<NotificationPage> {
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (options.level) {
    conditions.push('level = ?');
    bindings.push(options.level);
  }

  if (options.category) {
    conditions.push('category = ?');
    bindings.push(options.category);
  }

  if (options.unreadOnly) {
    conditions.push('read_at IS NULL');
  }

  const cursor = options.cursor ? decodeNotificationCursor(options.cursor) : null;
  if (cursor) {
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = clampNotificationLimit(options.limit);

  const result = await db
    .prepare(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notifications ${whereClause}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...bindings, limit + 1)
    .all<NotificationRow>();

  const rows = (result.results ?? []).map(toNotification);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? encodeNotificationCursor(lastItem) : null,
  };
}

export async function getNotification(
  db: D1Database,
  id: string,
): Promise<NotificationRecord | null> {
  const row = await db
    .prepare(`SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = ?`)
    .bind(id)
    .first<NotificationRow>();

  return row ? toNotification(row) : null;
}

export async function countUnreadNotifications(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM notifications WHERE read_at IS NULL')
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function setNotificationRead(
  db: D1Database,
  id: string,
  isRead: boolean,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE notifications SET read_at = ? WHERE id = ?')
    .bind(isRead ? new Date().toISOString() : null, id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function markAllNotificationsRead(db: D1Database): Promise<number> {
  const result = await db
    .prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL')
    .bind(new Date().toISOString())
    .run();

  return result.meta?.changes ?? 0;
}

export async function deleteReadNotifications(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM notifications WHERE read_at IS NOT NULL').run();

  return result.meta?.changes ?? 0;
}

export async function hasRecentNotification(
  db: D1Database,
  dedupeKey: string,
  sinceIso: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM notifications WHERE dedupe_key = ? AND created_at >= ? LIMIT 1')
    .bind(dedupeKey, sinceIso)
    .first<{ id: string }>();

  return row !== null;
}

export async function listRetryableNotifications(
  db: D1Database,
  maxAttempts: number,
  limit: number = NOTIFICATION_RETRY_BATCH,
): Promise<NotificationRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notifications
       WHERE push_status = 'failed' AND push_attempts < ?
       ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(maxAttempts, limit)
    .all<NotificationRow>();

  return (result.results ?? []).map(toNotification);
}

export async function setNotificationPushOutcome(
  db: D1Database,
  id: string,
  outcome: NotificationPushOutcome,
): Promise<void> {
  await db
    .prepare(
      `UPDATE notifications SET push_status = ?, push_channel = ?, push_error = ?,
        push_attempts = push_attempts + 1, pushed_at = ? WHERE id = ?`,
    )
    .bind(outcome.status, outcome.channel, outcome.error, outcome.pushedAt, id)
    .run();
}
