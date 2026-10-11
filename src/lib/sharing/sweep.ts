import { SHARE_MAX_FAILURES, SHARE_STALE_MS } from './types';

export interface RunShareSweepResult {
  swept: number;
}

export async function runShareSweep(
  db: D1Database,
  now: Date = new Date(),
): Promise<RunShareSweepResult> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - SHARE_STALE_MS).toISOString();

  const result = await db
    .prepare(
      `UPDATE share_outbox
       SET status = CASE WHEN failures + 1 >= ? THEN 'failed' ELSE 'pending' END,
         failures = failures + 1,
         locked_at = NULL,
         updated_at = ?
       WHERE status = 'sending' AND locked_at IS NOT NULL AND locked_at < ?`,
    )
    .bind(SHARE_MAX_FAILURES, nowIso, staleBefore)
    .run();

  return { swept: result.meta?.changes ?? 0 };
}
