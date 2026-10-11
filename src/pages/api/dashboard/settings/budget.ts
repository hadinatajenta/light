import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { readBudgetState, saveBudgetLimits } from '@/lib/agents/budget';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const budgetSchema = z.object({
  paused: z.boolean().optional(),
  dailySearches: z.number().int().min(0).max(100_000).optional(),
  monthlySearches: z.number().int().min(0).max(1_000_000).optional(),
  dailyTokens: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const state = await readBudgetState(database);

  return jsonOk(state, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = budgetSchema.parse(await readJsonBody(request, 10_000));

  await saveBudgetLimits(database, payload);
  const state = await readBudgetState(database);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.budget_updated',
    summary: state.paused ? 'Paused agent spending' : 'Updated the agent spending budget',
  });

  return jsonOk(state, requestId);
});
