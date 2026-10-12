import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import {
  describeNotificationSettings,
  saveNotificationSettings,
} from '@/lib/notifications/settings';

export const prerender = false;

const notificationSettingsSchema = z.object({
  dashboardUrl: z.url().max(200),
  email: z.object({
    enabled: z.boolean(),
    recipient: z.union([z.literal(''), z.email().max(200)]),
    sender: z.email().max(200),
  }),
  telegram: z.object({
    enabled: z.boolean(),
    chatId: z.string().trim().max(60),
    botToken: z.string().trim().max(200).optional(),
  }),
  events: z.record(z.string().max(60), z.boolean()).default({}),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const settings = await describeNotificationSettings(database);

  return jsonOk(settings, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = notificationSettingsSchema.parse(await readJsonBody(request, 20_000));
  const settings = await saveNotificationSettings(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.notifications_updated',
    summary: 'Updated notification channels',
  });

  return jsonOk(settings, requestId);
});
