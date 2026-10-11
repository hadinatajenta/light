import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';
import { runShareReconciler } from '@/lib/sharing/reconciler';
import { runShareSender } from '@/lib/sharing/sender';
import { runShareSweep } from '@/lib/sharing/sweep';

export const prerender = false;

const SHARE_BUDGET_MS = 90_000;
const SHARE_MAX_JOBS_PER_TICK = 5;
const SHARE_PER_CHANNEL_PER_TICK = 2;
const SHARE_JOB_DEADLINE_MS = 25_000;

export const POST = withAdmin(async ({ request, site }, requestId, user) => {
  const database = await requireContentDatabase();
  const now = new Date();
  const origin = site?.origin ?? new URL(request.url).origin;

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

  await recordActivity({
    ...toUserActor(user),
    action: 'share.run',
    summary: `Ran sharing: ${sender.sent} sent, ${sender.deferred} deferred, ${sender.failed} failed`,
  });

  return jsonOk(
    {
      reconciled: reconciled.inserted,
      skipped: reconciled.skipped,
      swept: swept.swept,
      processed: sender.processed,
      sent: sender.sent,
      failed: sender.failed,
      deferred: sender.deferred,
      remaining: sender.remaining,
    },
    requestId,
  );
});
