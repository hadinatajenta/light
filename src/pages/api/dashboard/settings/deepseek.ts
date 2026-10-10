import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { verifyApiKey } from '@/lib/agents/deepseek';
import { describeDeepseekKey, saveDeepseekKey } from '@/lib/agents/settings';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const deepseekKeyRequestSchema = z.object({
  apiKey: z.string().min(10).max(200),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const status = await describeDeepseekKey(database);

  return jsonOk({ configured: status.configured, hint: status.hint }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = deepseekKeyRequestSchema.parse(await readJsonBody(request, 10_000));

  await verifyApiKey(payload.apiKey);
  await saveDeepseekKey(database, payload.apiKey);

  const status = await describeDeepseekKey(database);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.deepseek_key_updated',
    summary: 'Updated the DeepSeek API key',
  });

  return jsonOk({ configured: true, hint: status.hint }, requestId);
});
