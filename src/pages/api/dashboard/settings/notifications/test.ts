import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';
import {
  deliverNotification,
  type NotificationDeliveryTarget,
  selectEnabledChannels,
} from '@/lib/notifications/deliver';
import { readNotificationSettings } from '@/lib/notifications/settings';

export const prerender = false;

function buildTestTarget(): NotificationDeliveryTarget {
  return {
    id: crypto.randomUUID(),
    event: 'agent.run.started',
    level: 'info',
    category: 'system',
    title: 'Test notification',
    body: 'Delivery works. This message came from the Light dashboard test button.',
    link: '/dashboard/notifications',
    createdAt: new Date().toISOString(),
  };
}

export const POST = withAdmin(async (_context, requestId, user) => {
  const database = await requireContentDatabase();
  const settings = await readNotificationSettings(database);
  const channels = selectEnabledChannels(settings);

  if (channels.length === 0) {
    throw new ApiError(
      422,
      'NOTIFICATION_CHANNEL_DISABLED',
      'Enable at least one notification channel before sending a test.',
    );
  }

  const outcome = await deliverNotification(database, buildTestTarget(), channels, settings);

  if (outcome.status !== 'sent') {
    throw new ApiError(
      502,
      'NOTIFICATION_TEST_FAILED',
      outcome.error ?? 'The test notification could not be delivered.',
    );
  }

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.notification_test',
    summary: `Sent a test notification via ${outcome.channel ?? 'an unknown channel'}`,
  });

  return jsonOk({ channel: outcome.channel }, requestId);
});
