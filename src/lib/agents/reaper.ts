import { runRetention } from '../maintenance/retention';
import { notify } from '../notifications/notify';
import { recordTopicFailure, scrapperResumeStatus } from './topics';

export const STALE_RUN_MS = 20 * 60 * 1000;

export function staleRunCutoff(now: number, staleMs: number = STALE_RUN_MS): string {
  return new Date(now - staleMs).toISOString();
}

export function isRunActive(startedAt: string, now: Date): boolean {
  return startedAt >= staleRunCutoff(now.getTime());
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

  const finishedAt = new Date(now).toISOString();

  for (const row of rows) {
    const agent = await db
      .prepare('SELECT role, name FROM agents WHERE id = ?')
      .bind(row.agent_id)
      .first<{ role: string; name: string }>()
      .catch(() => null);

    if (agent) {
      const claimedTopic = await db
        .prepare(
          "SELECT id FROM topics WHERE status = 'in_progress' AND assigned_agent_id = ? LIMIT 1",
        )
        .bind(row.agent_id)
        .first<{ id: string }>();

      if (claimedTopic) {
        const resumeStatus =
          agent.role === 'scrapper'
            ? await scrapperResumeStatus(db, claimedTopic.id)
            : topicStatusAfterInterruption(agent.role);

        await recordTopicFailure(
          db,
          claimedTopic.id,
          'Interrupted run, attempt recorded',
          resumeStatus,
        );
      }
    }

    await db
      .prepare(
        "UPDATE posts SET review_status = 'pending', updated_at = ? WHERE review_status = 'in_review' AND reviewed_by = ?",
      )
      .bind(finishedAt, row.agent_id)
      .run();

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

    await notify({
      event: 'agent.run.stale',
      title: 'A run was closed automatically',
      body: `A ${agent?.role ?? 'agent'} run exceeded its time budget and was closed. The claimed work was released.`,
      link: '/dashboard/activity',
      actorLabel: agent?.name,
      runId: row.id,
      metadata: { role: agent?.role ?? null },
    });
  }

  try {
    await runRetention(db, now);
  } catch (error) {
    console.error('Retention run failed', error);
  }

  return rows.length;
}
