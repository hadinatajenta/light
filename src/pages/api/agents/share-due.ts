import type { APIContext } from 'astro';
import { requireCronAuthorization } from '@/lib/agents/cron-auth';
import { requireContentDatabase } from '@/lib/content/database';
import { createRequestContext, jsonOk, toErrorResponse } from '@/lib/http';
import { runShareReconciler } from '@/lib/sharing/reconciler';
import { runShareSender } from '@/lib/sharing/sender';
import { runShareSweep } from '@/lib/sharing/sweep';

export const prerender = false;

const SHARE_BUDGET_MS = 90_000;
const SHARE_MAX_JOBS_PER_TICK = 5;
const SHARE_PER_CHANNEL_PER_TICK = 2;
const SHARE_JOB_DEADLINE_MS = 25_000;

function resolveOrigin(context: APIContext): string {
  if (context.site) {
    return context.site.origin;
  }

  return new URL(context.request.url).origin;
}

export const POST = async (context: APIContext): Promise<Response> => {
  const { requestId } = createRequestContext();

  try {
    await requireCronAuthorization(context.request);

    const database = await requireContentDatabase();
    const now = new Date();
    const origin = resolveOrigin(context);

    const reconciled = await runShareReconciler(database, now);
    const swept = await runShareSweep(database, now);
    const sender = await runShareSender(database, {
      now,
      origin,
      budgetMs: SHARE_BUDGET_MS,
      maxJobs: SHARE_MAX_JOBS_PER_TICK,
      perChannelLimit: SHARE_PER_CHANNEL_PER_TICK,
      jobDeadlineMs: SHARE_JOB_DEADLINE_MS,
    });

    return jsonOk(
      {
        reconciled: reconciled.inserted,
        skipped: reconciled.skipped,
        swept: swept.swept,
        processed: sender.processed,
        remaining: sender.remaining,
        sent: sender.sent,
        failed: sender.failed,
        deferred: sender.deferred,
      },
      requestId,
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
};
