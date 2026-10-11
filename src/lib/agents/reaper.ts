import { scrapperResumeStatus } from './topics';

export const STALE_RUN_MS = 20 * 60 * 1000;

export function staleRunCutoff(now: number, staleMs: number = STALE_RUN_MS): string {
  return new Date(now - staleMs).toISOString();
}

export function topicStatusAfterInterruption(role: string): 'queued' | 'researched' {
  return role === 'writer' ? 'researched' : 'queued';
}

interface StaleRunRow {
  id: string;
  agent_id: string;
}

export async function reapStaleRuns(db: D1Database, now: number = Date.now()): Promise<number> {
  const cutoff = staleRunCutoff(now);

  const stale = await db
    .prepare("SELECT id, agent_id FROM agent_runs WHERE status = 'running' AND started_at < ?")
    .bind(cutoff)
    .all<StaleRunRow>();

  const rows = stale.results ?? [];
  if (rows.length === 0) {
    return 0;
  }

  const finishedAt = new Date(now).toISOString();

  for (const row of rows) {
    const agent = await db
      .prepare('SELECT role FROM agents WHERE id = ?')
      .bind(row.agent_id)
      .first<{ role: string }>()
      .catch(() => null);

    if (agent) {
      const claimedTopic = await db
        .prepare(
          "SELECT id FROM topics WHERE status = 'in_progress' AND assigned_agent_id = ? LIMIT 1",
        )
        .bind(row.agent_id)
        .first<{ id: string }>();

      let resumeStatus: 'queued' | 'fetched' | 'researched' = topicStatusAfterInterruption(
        agent.role,
      );

      if (agent.role === 'scrapper' && claimedTopic) {
        resumeStatus = await scrapperResumeStatus(db, claimedTopic.id);
      }

      await db
        .prepare(
          `UPDATE topics SET status = ?, assigned_agent_id = NULL, note = ?, updated_at = ?
           WHERE status = 'in_progress' AND assigned_agent_id = ?`,
        )
        .bind(
          resumeStatus,
          'Released automatically after an interrupted run',
          finishedAt,
          row.agent_id,
        )
        .run();
    }

    await db
      .prepare(
        `UPDATE agent_runs SET status = 'failed', summary = ?, error = ?, finished_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(
        'Run interrupted and closed automatically',
        'The run stopped before it could report a result, most likely because it exceeded its time budget.',
        finishedAt,
        row.id,
      )
      .run();
  }

  return rows.length;
}
