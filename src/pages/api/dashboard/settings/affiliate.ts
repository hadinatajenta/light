import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { readAffiliateLinksEnabled, saveAffiliateLinksEnabled } from '@/lib/affiliate/settings';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const affiliateLinksSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const enabled = await readAffiliateLinksEnabled(database);

  return jsonOk({ enabled }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = affiliateLinksSchema.parse(await readJsonBody(request, 1_000));
  const current = await readAffiliateLinksEnabled(database);

  if (current !== payload.enabled) {
    await saveAffiliateLinksEnabled(database, payload.enabled);

    await recordActivity({
      ...toUserActor(user),
      action: 'settings.affiliate_links_updated',
      summary: payload.enabled ? 'Turned affiliate links on' : 'Turned affiliate links off',
    });
  }

  return jsonOk({ enabled: payload.enabled }, requestId);
});
