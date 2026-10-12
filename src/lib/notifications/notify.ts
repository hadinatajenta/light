import { resolveContentDatabase } from '../content/database';
import { deliverNotification, selectNotificationChannels } from './deliver';
import {
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  sanitizeNotificationText,
} from './format';
import { buildNotificationDedupeKey, resolveNotificationRule } from './rules';
import { readNotificationSettings } from './settings';
import {
  hasRecentNotification,
  insertNotification,
  type NotificationInsert,
  setNotificationPushOutcome,
} from './store';
import type { NotificationInput } from './types';

const MILLISECONDS_PER_SECOND = 1000;

export async function notify(input: NotificationInput): Promise<void> {
  try {
    const database = await resolveContentDatabase();
    if (!database) {
      return;
    }

    await recordNotification(database, input);
  } catch (error) {
    console.error(`[notifications] failed to record event=${input.event}`, error);
  }
}

async function recordNotification(database: D1Database, input: NotificationInput): Promise<void> {
  const rule = resolveNotificationRule(input.event);
  const dedupeKey = buildNotificationDedupeKey(
    input.event,
    input.dedupeSubject,
    rule.dedupeWindowSeconds,
  );

  if (dedupeKey) {
    const since = new Date(
      Date.now() - rule.dedupeWindowSeconds * MILLISECONDS_PER_SECOND,
    ).toISOString();

    if (await hasRecentNotification(database, dedupeKey, since)) {
      return;
    }
  }

  const record: NotificationInsert = {
    id: crypto.randomUUID(),
    level: rule.level,
    category: rule.category,
    event: input.event,
    title: sanitizeNotificationText(input.title, NOTIFICATION_SUBJECT_MAX_LENGTH),
    body: input.body ? sanitizeNotificationText(input.body, NOTIFICATION_BODY_MAX_LENGTH) : null,
    link: input.link ?? null,
    metadata: input.metadata ?? null,
    actorLabel: input.actorLabel ?? null,
    runId: input.runId ?? null,
    dedupeKey,
    createdAt: new Date().toISOString(),
  };

  await insertNotification(database, record);

  const settings = await readNotificationSettings(database);
  const channels = selectNotificationChannels(settings, input.event, rule.push);

  if (channels.length === 0) {
    return;
  }

  const outcome = await deliverNotification(database, record, channels, settings);
  await setNotificationPushOutcome(database, record.id, outcome);
}
