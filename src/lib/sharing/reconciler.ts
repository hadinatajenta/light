import { getSetting } from '../settings/store';
import { listShareableChannels } from './channels';
import {
  DEFAULT_SHARE_MAX_AGE_DAYS,
  SHARE_BACKFILL_CUTOFF_SETTING,
  SHARE_MAX_AGE_DAYS_SETTING,
  SHARE_PAUSED_SETTING,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShareSettings {
  paused: boolean;
  cutoff: string | null;
  maxAgeDays: number;
}

export interface EligibilityFloorInput {
  now: Date;
  cutoff: string | null;
  startedAt: string | null;
  maxAgeDays: number;
}

function readBoolean(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export async function readShareSettings(db: D1Database): Promise<ShareSettings> {
  const [paused, cutoff, maxAge] = await Promise.all([
    getSetting(db, SHARE_PAUSED_SETTING),
    getSetting(db, SHARE_BACKFILL_CUTOFF_SETTING),
    getSetting(db, SHARE_MAX_AGE_DAYS_SETTING),
  ]);

  const parsed = maxAge ? Number.parseInt(maxAge, 10) : Number.NaN;

  return {
    paused: readBoolean(paused),
    cutoff,
    maxAgeDays: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SHARE_MAX_AGE_DAYS,
  };
}

export async function isSharePaused(db: D1Database): Promise<boolean> {
  return readBoolean(await getSetting(db, SHARE_PAUSED_SETTING));
}

function toSqliteDateTime(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 19).replace('T', ' ');
}

export function computeEligibilityFloor(input: EligibilityFloorInput): string {
  const candidates = [input.now.getTime() - input.maxAgeDays * DAY_MS];

  if (input.cutoff) {
    const cutoffMs = Date.parse(input.cutoff);
    if (!Number.isNaN(cutoffMs)) {
      candidates.push(cutoffMs);
    }
  }

  if (input.startedAt) {
    const startedMs = Date.parse(input.startedAt);
    if (!Number.isNaN(startedMs)) {
      candidates.push(startedMs);
    }
  }

  return toSqliteDateTime(new Date(Math.max(...candidates)).toISOString());
}

async function skipIneligibleShares(
  db: D1Database,
  now: Date,
  maxAgeDays: number,
): Promise<number> {
  const nowIso = now.toISOString();
  const ageCutoffIso = new Date(now.getTime() - maxAgeDays * DAY_MS).toISOString();

  const result = await db
    .prepare(
      `UPDATE share_outbox SET status = 'skipped', updated_at = ?
       WHERE status IN ('pending', 'awaiting_approval')
         AND (
           post_id NOT IN (SELECT id FROM posts WHERE status = 'published')
           OR COALESCE(age_reset_at, created_at) < ?
         )`,
    )
    .bind(nowIso, ageCutoffIso)
    .run();

  return result.meta?.changes ?? 0;
}

export interface RunShareReconcilerResult {
  inserted: number;
  skipped: number;
}

export async function runShareReconciler(
  db: D1Database,
  now: Date = new Date(),
): Promise<RunShareReconcilerResult> {
  const settings = await readShareSettings(db);
  const skipped = await skipIneligibleShares(db, now, settings.maxAgeDays);

  if (settings.paused) {
    return { inserted: 0, skipped };
  }

  const channels = await listShareableChannels(db);
  const nowIso = now.toISOString();
  let inserted = 0;

  for (const channel of channels) {
    const floor = computeEligibilityFloor({
      now,
      cutoff: settings.cutoff,
      startedAt: channel.startedAt,
      maxAgeDays: settings.maxAgeDays,
    });

    const eligible = await db
      .prepare(
        `SELECT id FROM posts
         WHERE status = 'published'
           AND COALESCE(datetime(published_at), datetime(pub_date), datetime(created_at)) >= ?`,
      )
      .bind(floor)
      .all<{ id: string }>();

    const status = channel.requireApproval ? 'awaiting_approval' : 'pending';

    for (const post of eligible.results ?? []) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO share_outbox (id, post_id, channel_id, status, attempts, failures,
            rate_limit_hits, next_attempt_at, age_reset_at, locked_at, provider_post_id, shared_url,
            error, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 0, 0, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .bind(crypto.randomUUID(), post.id, channel.id, status, nowIso, nowIso, nowIso)
        .run();

      if ((result.meta?.changes ?? 0) > 0) {
        inserted += 1;
      }
    }
  }

  return { inserted, skipped };
}
