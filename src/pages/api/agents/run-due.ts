import type { APIContext } from 'astro';
import { insertActivity } from '@/lib/activity/store';
import { requireCronAuthorization } from '@/lib/agents/cron-auth';
import { abandonedRunResult, runQuotaCatchUp } from '@/lib/agents/pipeline';
import { evaluateDailyQuota, readQuotaSettings, startOfWibDay } from '@/lib/agents/quota';
import { reapStaleRuns } from '@/lib/agents/reaper';
import { sortAgentsByRoleOrder } from '@/lib/agents/roles';
import { withRunDeadline } from '@/lib/agents/run-deadline';
import { runAgent } from '@/lib/agents/runner';
import { listDueAgents, reconcileSystemAgents, SYSTEM_ANALYST_AGENT_ID } from '@/lib/agents/store';
import { requireContentDatabase } from '@/lib/content/database';
import { createRequestContext, jsonOk, toErrorResponse } from '@/lib/http';
import { backfillOneCover } from '@/lib/media/covers';
import { countPublishedSince, publishDuePosts } from '@/lib/scheduling/store';

export const prerender = false;

const RUN_BUDGET_MS = 240_000;
const RUN_SAFETY_MS = 30_000;
const MIN_RUN_MS = 20_000;
const COVER_MIN_REMAINING_MS = 60_000;
const CATCH_UP_MAX_RUNS = 3;

async function generateOneCoverQuietly(database: D1Database): Promise<number> {
  try {
    const assignment = await backfillOneCover(database);
    return assignment ? 1 : 0;
  } catch (error) {
    console.error('Cover backfill failed', error);
    return 0;
  }
}

export const POST = async (context: APIContext): Promise<Response> => {
  const { requestId } = createRequestContext();

  try {
    await requireCronAuthorization(context.request);

    const database = await requireContentDatabase();
    const reconciliation = await reconcileSystemAgents(database);

    if (reconciliation.summary) {
      await insertActivity(database, {
        actorId: 'system-agent-reconciler',
        actorType: 'agent',
        actorLabel: 'System',
        action: reconciliation.changed ? 'agent.reconciled' : 'agent.reconcile_conflict',
        targetType: 'agent',
        targetId: SYSTEM_ANALYST_AGENT_ID,
        summary: reconciliation.summary,
      });
    }

    const reaped = await reapStaleRuns(database);
    const schedule = await publishDuePosts(database);
    const due = sortAgentsByRoleOrder(await listDueAgents(database, new Date().toISOString()));

    const startedAt = Date.now();
    const runDeadline = startedAt + RUN_BUDGET_MS - RUN_SAFETY_MS;
    const results: Array<{ agentId: string; status: string; summary: string }> = [];
    let processed = 0;
    let coversGenerated = 0;

    if (due.length === 0) {
      coversGenerated = await generateOneCoverQuietly(database);
    }

    for (const agent of due) {
      const remaining = runDeadline - Date.now();
      if (remaining < MIN_RUN_MS) {
        break;
      }

      const result = await withRunDeadline(
        runAgent(database, agent, {
          signal: AbortSignal.timeout(remaining),
          deadline: runDeadline,
        }),
        remaining,
        abandonedRunResult(),
      );
      results.push({ agentId: agent.id, status: result.status, summary: result.summary });
      processed += 1;
    }

    const quotaSettings = await readQuotaSettings(database);
    const publishedToday = await countPublishedSince(
      database,
      startOfWibDay(new Date()).toISOString(),
    );
    const quota = evaluateDailyQuota(publishedToday, quotaSettings.target);
    let catchUpRuns = 0;

    if (quota.behind) {
      const catchUp = await runQuotaCatchUp(database, {
        deadline: runDeadline,
        maxRuns: CATCH_UP_MAX_RUNS,
      });
      catchUpRuns = catchUp.length;

      if (catchUpRuns > 0) {
        await insertActivity(database, {
          actorId: 'quota',
          actorType: 'agent',
          actorLabel: 'Quota',
          action: 'pipeline.quota_catchup',
          summary: `Catch-up ran ${catchUpRuns} run(s); ${publishedToday} of ${quota.target} published today`,
        });
      }
    }

    if (coversGenerated === 0 && runDeadline - Date.now() > COVER_MIN_REMAINING_MS) {
      coversGenerated = await generateOneCoverQuietly(database);
    }

    return jsonOk(
      {
        published: schedule.published,
        reaped,
        analystReconciled: reconciliation.changed,
        coversGenerated,
        processed,
        remaining: due.length - processed,
        results,
        publishTarget: quota.target,
        publishedToday,
        catchUpRuns,
      },
      requestId,
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
};
