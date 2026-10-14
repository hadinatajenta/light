import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { readAnalystConfig, saveAnalystConfig } from '@/lib/agents/analyst/config';
import { SYSTEM_ANALYST_AGENT_ID } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const analystSettingsSchema = z.object({
  noLinkMinViewsShare: z.number().min(0).max(1),
  noLinkMinViewsFloor: z.number().int().min(0).max(1_000),
  brokenPlacementMinClicks: z.number().int().min(0).max(10_000),
  redirectMissMinCount: z.number().int().min(1).max(10_000),
  zeroViewsMinAgeDays: z.number().int().min(1).max(3_650),
  zeroViewsMaxFindings: z.number().int().min(0).max(100),
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = analystSettingsSchema.parse(await readJsonBody(request, 20_000));

  await saveAnalystConfig(database, payload);
  const config = await readAnalystConfig(database);

  await recordActivity({
    ...toUserActor(user),
    action: 'analyst.settings_updated',
    targetType: 'agent',
    targetId: SYSTEM_ANALYST_AGENT_ID,
    summary: 'Updated the performance analyst thresholds',
  });

  return jsonOk({ config }, requestId);
});
