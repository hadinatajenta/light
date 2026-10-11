import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { DEFAULT_SITE_SETTINGS, getSiteSettings, saveSiteSettings } from '@/lib/settings/site';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const settings = await getSiteSettings(database);

  return jsonOk({ settings, defaults: DEFAULT_SITE_SETTINGS }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = await readJsonBody(request, 20_000);
  const settings = await saveSiteSettings(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.site_updated',
    summary: `Updated site settings (title: ${settings.title})`,
  });

  return jsonOk({ settings }, requestId);
});
