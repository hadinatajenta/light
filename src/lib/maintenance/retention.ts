export const RETENTION_DAYS = 90;
export const RETENTION_INTERVAL_MS = 12 * 60 * 60 * 1000;

const RETENTION_KEY = 'retention';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  skipped: boolean;
  activityDeleted: number;
  runsDeleted: number;
}

export function retentionCutoffIso(now: number): string {
  return new Date(now - RETENTION_DAYS * DAY_MS).toISOString();
}

export function shouldRunRetention(ranAt: string | null, now: number): boolean {
  if (!ranAt) {
    return true;
  }

  const lastRanAt = Date.parse(ranAt);
  if (Number.isNaN(lastRanAt)) {
    return true;
  }

  return now - lastRanAt >= RETENTION_INTERVAL_MS;
}

export async function runRetention(
  db: D1Database,
  now: number = Date.now(),
): Promise<RetentionResult> {
  const state = await db
    .prepare('SELECT ran_at FROM maintenance_state WHERE key = ?')
    .bind(RETENTION_KEY)
    .first<{ ran_at: string }>();

  if (!shouldRunRetention(state?.ran_at ?? null, now)) {
    return { skipped: true, activityDeleted: 0, runsDeleted: 0 };
  }

  const cutoff = retentionCutoffIso(now);

  const activityResult = await db
    .prepare('DELETE FROM activity WHERE created_at < ?')
    .bind(cutoff)
    .run();

  const runsResult = await db
    .prepare("DELETE FROM agent_runs WHERE status != 'running' AND finished_at < ?")
    .bind(cutoff)
    .run();

  await db
    .prepare(
      `INSERT INTO maintenance_state (key, ran_at) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET ran_at = excluded.ran_at`,
    )
    .bind(RETENTION_KEY, new Date(now).toISOString())
    .run();

  return {
    skipped: false,
    activityDeleted: activityResult.meta.changes ?? 0,
    runsDeleted: runsResult.meta.changes ?? 0,
  };
}
