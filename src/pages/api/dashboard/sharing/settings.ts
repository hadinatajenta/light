import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { setSetting } from '@/lib/settings/store';
import { isSharePaused } from '@/lib/sharing/reconciler';
import { SHARE_PAUSED_SETTING } from '@/lib/sharing/types';

export const prerender = false;

const pauseSchema = z.object({
  paused: z.boolean(),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const paused = await isSharePaused(database);

  return jsonOk({ paused }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = pauseSchema.parse(await readJsonBody(request, 5_000));

  await setSetting(database, SHARE_PAUSED_SETTING, payload.paused ? '1' : '0');

  await recordActivity({
    ...toUserActor(user),
    action: payload.paused ? 'share.paused' : 'share.resumed',
    summary: payload.paused ? 'Paused automatic sharing' : 'Resumed automatic sharing',
  });

  return jsonOk({ paused: payload.paused }, requestId);
});
