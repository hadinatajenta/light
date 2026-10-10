import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { setAgentEnabled } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const statusRequestSchema = z.object({
  enabled: z.boolean(),
});

export const POST = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The agent id is required.');
  }

  const payload = statusRequestSchema.parse(await readJsonBody(request, 10_000));
  const agent = await setAgentEnabled(database, id, payload.enabled);

  await recordActivity({
    ...toUserActor(user),
    action: payload.enabled ? 'agent.enabled' : 'agent.disabled',
    targetType: 'agent',
    targetId: agent.id,
    summary: payload.enabled ? `Enabled agent "${agent.name}"` : `Disabled agent "${agent.name}"`,
  });

  return jsonOk({ agent }, requestId);
});
