import { todayKey } from '../agents/budget';
import type { ShareJob, ShareStatus } from './types';

interface ShareOutboxRow {
  id: string;
  post_id: string;
  channel_id: string;
  status: string;
  attempts: number;
  failures: number;
  rate_limit_hits: number;
  next_attempt_at: string;
  age_reset_at: string | null;
  locked_at: string | null;
  provider_post_id: string | null;
  shared_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimShareJobsOptions {
  now: string;
  limit: number;
  perChannelLimit: number;
}

export interface MarkShareSentInput {
  lockedAt: string;
  providerPostId: string | null;
  sharedUrl: string;
}

export interface GuardedShareInput {
  lockedAt: string;
}

export interface RescheduleShareInput extends GuardedShareInput {
  nextAttemptAt: string;
  error?: string;
}

export interface ShareFailureInput extends GuardedShareInput {
  failures: number;
  nextAttemptAt: string | null;
  error?: string;
}

function readStatus(value: string): ShareStatus {
  if (
    value === 'sending' ||
    value === 'sent' ||
    value === 'failed' ||
    value === 'awaiting_approval' ||
    value === 'skipped'
  ) {
    return value;
  }

  return 'pending';
}

function toJob(row: ShareOutboxRow): ShareJob {
  return {
    id: row.id,
    postId: row.post_id,
    channelId: row.channel_id,
    status: readStatus(row.status),
    attempts: row.attempts,
    failures: row.failures,
    rateLimitHits: row.rate_limit_hits,
    nextAttemptAt: row.next_attempt_at,
    ageResetAt: row.age_reset_at,
    lockedAt: row.locked_at,
    providerPostId: row.provider_post_id,
    sharedUrl: row.shared_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listShareJobs(db: D1Database, limit = 100): Promise<ShareJob[]> {
  const bounded = Math.min(Math.max(limit, 1), 500);
  const result = await db
    .prepare('SELECT * FROM share_outbox ORDER BY created_at DESC LIMIT ?')
    .bind(bounded)
    .all<ShareOutboxRow>();

  return (result.results ?? []).map(toJob);
}

export async function getShareJob(db: D1Database, id: string): Promise<ShareJob | null> {
  const row = await db
    .prepare('SELECT * FROM share_outbox WHERE id = ?')
    .bind(id)
    .first<ShareOutboxRow>();

  return row ? toJob(row) : null;
}

export async function retryShareJob(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE share_outbox SET status = 'pending', attempts = 0, failures = 0, rate_limit_hits = 0,
        next_attempt_at = ?, age_reset_at = ?, locked_at = NULL, error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, now, now, id)
    .run();
}

export async function approveShareJob(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE share_outbox SET status = 'pending', next_attempt_at = ?, age_reset_at = ?,
        updated_at = ? WHERE id = ?`,
    )
    .bind(now, now, now, id)
    .run();
}

export async function claimShareJobs(
  db: D1Database,
  options: ClaimShareJobsOptions,
): Promise<ShareJob[]> {
  const day = todayKey(new Date(options.now));
  const result = await db
    .prepare(
      `UPDATE share_outbox
       SET status = 'sending', locked_at = ?, attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM (
           SELECT o.id, o.next_attempt_at,
             ROW_NUMBER() OVER (PARTITION BY o.channel_id ORDER BY o.next_attempt_at) AS rn
           FROM share_outbox o
           JOIN share_channels c ON c.id = o.channel_id
           WHERE o.status = 'pending'
             AND o.next_attempt_at <= ?
             AND c.enabled = 1
             AND c.needs_attention = 0
             AND (c.paused_until IS NULL OR c.paused_until <= ?)
             AND (c.daily_cap IS NULL OR (
               SELECT COALESCE(SUM(u.count), 0) FROM usage_counters u
               WHERE u.kind = 'share:' || c.id AND u.day = ?
             ) < c.daily_cap)
         )
         WHERE rn <= ?
         ORDER BY next_attempt_at
         LIMIT ?
       )
       RETURNING *`,
    )
    .bind(options.now, options.now, options.now, day, options.perChannelLimit, options.limit)
    .all<ShareOutboxRow>();

  return (result.results ?? []).map(toJob);
}

function guardedChanges(result: { meta?: { changes?: number } }): boolean {
  return (result.meta?.changes ?? 0) > 0;
}

export async function markShareSent(
  db: D1Database,
  id: string,
  input: MarkShareSentInput,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'sent', provider_post_id = ?, shared_url = ?, error = NULL,
        locked_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(input.providerPostId, input.sharedUrl, now, id, input.lockedAt)
    .run();

  return guardedChanges(result);
}

export async function markShareFailed(
  db: D1Database,
  id: string,
  input: { lockedAt: string; error: string },
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'failed', error = ?, locked_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(input.error, now, id, input.lockedAt)
    .run();

  return guardedChanges(result);
}

export async function markShareSkipped(
  db: D1Database,
  id: string,
  input: GuardedShareInput,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'skipped', locked_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(now, id, input.lockedAt)
    .run();

  return guardedChanges(result);
}

export async function rescheduleShareJob(
  db: D1Database,
  id: string,
  input: RescheduleShareInput,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'pending', next_attempt_at = ?, error = ?, locked_at = NULL,
        updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(input.nextAttemptAt, input.error ?? null, now, id, input.lockedAt)
    .run();

  return guardedChanges(result);
}

export async function recordShareRateLimit(
  db: D1Database,
  id: string,
  input: RescheduleShareInput,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'pending', rate_limit_hits = rate_limit_hits + 1,
        next_attempt_at = ?, error = ?, locked_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(input.nextAttemptAt, input.error ?? null, now, id, input.lockedAt)
    .run();

  return guardedChanges(result);
}

export async function recordShareFailure(
  db: D1Database,
  id: string,
  input: ShareFailureInput,
): Promise<boolean> {
  const now = new Date().toISOString();
  const status = input.nextAttemptAt === null ? 'failed' : 'pending';
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = ?, failures = ?, next_attempt_at = ?, error = ?,
        locked_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending' AND locked_at = ?`,
    )
    .bind(
      status,
      input.failures,
      input.nextAttemptAt ?? now,
      input.error ?? null,
      now,
      id,
      input.lockedAt,
    )
    .run();

  return guardedChanges(result);
}

export async function returnUnprocessedShares(db: D1Database, ids: string[]): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'pending', attempts = attempts - 1, locked_at = NULL,
        updated_at = ?
       WHERE status = 'sending' AND id IN (${placeholders})`,
    )
    .bind(now, ...ids)
    .run();

  return result.meta?.changes ?? 0;
}
