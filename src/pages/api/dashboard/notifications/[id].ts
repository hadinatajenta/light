import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { countUnreadNotifications, setNotificationRead } from '@/lib/notifications/store';

export const prerender = false;

const notificationUpdateSchema = z.object({
  read: z.boolean(),
});

export const PATCH = withAdmin(async ({ params, request }, requestId) => {
  const database = await requireContentDatabase();
  const id = params.id;

  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The notification id is required.');
  }

  const payload = notificationUpdateSchema.parse(await readJsonBody(request, 2_000));
  const updated = await setNotificationRead(database, id, payload.read);

  if (!updated) {
    throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'That notification does not exist.');
  }

  const unreadCount = await countUnreadNotifications(database);

  return jsonOk({ id, read: payload.read, unreadCount }, requestId);
});
