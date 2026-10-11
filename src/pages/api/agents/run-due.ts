import type { APIContext } from 'astro';
import { requireCronAuthorization } from '@/lib/agents/cron-auth';
import { reapStaleRuns } from '@/lib/agents/reaper';
import { runAgent } from '@/lib/agents/runner';
import { listDueAgents } from '@/lib/agents/store';
import { requireContentDatabase } from '@/lib/content/database';
import { createRequestContext, jsonOk, toErrorResponse } from '@/lib/http';
import { backfillOneCover } from '@/lib/media/covers';
import { publishDuePosts } from '@/lib/scheduling/store';

export const prerender = false;

const RUN_BUDGET_MS = 240_000;
const RUN_SAFETY_MS = 30_000;
const MIN_RUN_MS = 20_000;
const COVER_MIN_REMAINING_MS = 60_000;

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
    const reaped = await reapStaleRuns(database);
    const schedule = await publishDuePosts(database);
    const due = await listDueAgents(database, new Date().toISOString());

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

      const result = await runAgent(database, agent, AbortSignal.timeout(remaining), runDeadline);
      results.push({ agentId: agent.id, status: result.status, summary: result.summary });
      processed += 1;
    }

    if (coversGenerated === 0 && runDeadline - Date.now() > COVER_MIN_REMAINING_MS) {
      coversGenerated = await generateOneCoverQuietly(database);
    }

    return jsonOk(
      {
        published: schedule.published,
        reaped,
        coversGenerated,
        processed,
        remaining: due.length - processed,
        results,
      },
      requestId,
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
};
