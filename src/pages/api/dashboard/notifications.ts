import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import {
  countUnreadNotifications,
  deleteReadNotifications,
  listNotifications,
  markAllNotificationsRead,
  NOTIFICATION_DEFAULT_LIMIT,
} from '@/lib/notifications/store';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LEVELS,
  type NotificationCategory,
  type NotificationLevel,
} from '@/lib/notifications/types';

export const prerender = false;

const markAllReadSchema = z.object({ read: z.literal(true) });

function readLevel(value: string | null): NotificationLevel | undefined {
  if (value && (NOTIFICATION_LEVELS as readonly string[]).includes(value)) {
    return value as NotificationLevel;
  }

  return undefined;
}

function readCategory(value: string | null): NotificationCategory | undefined {
  if (value && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)) {
    return value as NotificationCategory;
  }

  return undefined;
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);

  const page = await listNotifications(database, {
    level: readLevel(url.searchParams.get('level')),
    category: readCategory(url.searchParams.get('category')),
    unreadOnly: url.searchParams.get('unread') === '1',
    limit: Number.isFinite(limitParam) ? limitParam : NOTIFICATION_DEFAULT_LIMIT,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });

  const unreadCount = await countUnreadNotifications(database);

  return jsonOk(
    {
      notifications: page.items,
      unreadCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
    requestId,
  );
});

export const PATCH = withAdmin(async ({ request }, requestId) => {
  const database = await requireContentDatabase();
  markAllReadSchema.parse(await readJsonBody(request, 2_000));

  const updated = await markAllNotificationsRead(database);
  const unreadCount = await countUnreadNotifications(database);

  return jsonOk({ updated, unreadCount }, requestId);
});

export const DELETE = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();

  if (url.searchParams.get('scope') !== 'read') {
    throw new ApiError(422, 'INVALID_SCOPE', 'Only scope=read is supported.');
  }

  const deleted = await deleteReadNotifications(database);

  return jsonOk({ deleted }, requestId);
});
