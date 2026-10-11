import { recordActivity, toUserActor } from '@/lib/activity/record';
import { runPipeline } from '@/lib/agents/pipeline';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';
import { getSetting, setSetting } from '@/lib/settings/store';

export const prerender = false;

const LOCK_KEY = 'pipeline_run_lock';
const BUDGET_MS = 180_000;
const LOCK_TTL_MS = BUDGET_MS + 60_000;

async function isRunning(db: D1Database): Promise<boolean> {
  const stored = await getSetting(db, LOCK_KEY);
  if (!stored) {
    return false;
  }

  const startedAt = Date.parse(stored);
  return Number.isFinite(startedAt) && Date.now() - startedAt < LOCK_TTL_MS;
}

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();

  return jsonOk({ running: await isRunning(database) }, requestId);
});

export const POST = withAdmin(async (context, requestId, user) => {
  const database = await requireContentDatabase();

  if (await isRunning(database)) {
    throw new ApiError(409, 'PIPELINE_BUSY', 'A run and publish pass is already in progress.');
  }

  await setSetting(database, LOCK_KEY, new Date().toISOString());
  await recordActivity({
    ...toUserActor(user),
    action: 'pipeline.run_and_publish',
    summary: 'Started a run and publish pass',
  });

  const task = runPipeline(database, { budgetMs: BUDGET_MS })
    .then(async (result) => {
      await recordActivity({
        ...toUserActor(user),
        action: 'pipeline.run_and_publish',
        summary: `Run and publish finished: ${result.published.length} published, ${result.runs.length} run(s)`,
      });
    })
    .catch((error) => {
      console.error('Run and publish failed', error);
    })
    .finally(async () => {
      await setSetting(database, LOCK_KEY, '').catch(() => undefined);
    });

  const executionContext = context.locals.cfContext;
  if (executionContext) {
    executionContext.waitUntil(task);
  } else {
    await task;
  }

  return jsonOk({ started: true }, requestId, 202);
});
