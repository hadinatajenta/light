import { sendNotificationEmail } from './channels/email';
import { sendNotificationTelegram } from './channels/telegram';
import type { NotificationChannelResult } from './channels/types';
import {
  formatNotificationHtml,
  formatNotificationSubject,
  formatNotificationText,
  type NotificationMessageSource,
} from './format';
import { resolveNotificationRule } from './rules';
import {
  type NotificationSettings,
  readNotificationSettings,
  readTelegramBotToken,
} from './settings';
import {
  listRetryableNotifications,
  NOTIFICATION_RETRY_BATCH,
  type NotificationPushOutcome,
  setNotificationPushOutcome,
} from './store';
import {
  NOTIFICATION_MAX_PUSH_ATTEMPTS,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationRecord,
} from './types';

export const NOTIFICATION_DELIVERY_TIMEOUT_MS = 8_000;
const MAX_PUSH_ERROR_LENGTH = 500;

export type NotificationDeliveryTarget = Pick<
  NotificationRecord,
  'id' | 'event' | 'level' | 'category' | 'title' | 'body' | 'link' | 'createdAt'
>;

export interface NotificationRetrySummary {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

export function selectEnabledChannels(settings: NotificationSettings): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  if (settings.email.enabled && settings.email.recipient !== '') {
    channels.push('email');
  }

  if (
    settings.telegram.enabled &&
    settings.telegram.chatId !== '' &&
    settings.telegram.hasBotToken
  ) {
    channels.push('telegram');
  }

  return channels;
}

export function selectNotificationChannels(
  settings: NotificationSettings,
  event: NotificationEvent,
  ruleAllowsPush: boolean,
): NotificationChannel[] {
  if (!ruleAllowsPush || settings.events[event] === false) {
    return [];
  }

  return selectEnabledChannels(settings);
}

export function buildNotificationUrl(link: string | null, dashboardUrl: string): string | null {
  if (!link) {
    return null;
  }

  if (/^https?:\/\//i.test(link)) {
    return link;
  }

  return `${dashboardUrl}${link.startsWith('/') ? '' : '/'}${link}`;
}

export function buildNotificationMessageSource(
  record: NotificationDeliveryTarget,
  dashboardUrl: string,
): NotificationMessageSource {
  return {
    level: record.level,
    category: record.category,
    title: record.title,
    body: record.body,
    link: buildNotificationUrl(record.link, dashboardUrl),
    createdAt: record.createdAt,
  };
}

export async function runWithDeadline(
  operation: () => Promise<NotificationChannelResult>,
  timeoutMs: number = NOTIFICATION_DELIVERY_TIMEOUT_MS,
): Promise<NotificationChannelResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<NotificationChannelResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ outcome: 'transient', error: `Delivery timed out after ${timeoutMs}ms.` }),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation(), deadline]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { outcome: 'transient', error: detail.slice(0, MAX_PUSH_ERROR_LENGTH) };
  } finally {
    clearTimeout(timer);
  }
}

async function readTelegramTokenSafely(db: D1Database): Promise<string | null> {
  try {
    return await readTelegramBotToken(db);
  } catch (error) {
    console.error('[notifications] telegram token could not be read', error);
    return null;
  }
}

async function sendToChannel(
  source: NotificationMessageSource,
  channel: NotificationChannel,
  settings: NotificationSettings,
  botToken: string | null,
): Promise<NotificationChannelResult> {
  if (channel === 'email') {
    return runWithDeadline(() =>
      sendNotificationEmail({
        to: settings.email.recipient,
        from: settings.email.sender,
        subject: formatNotificationSubject(source),
        text: formatNotificationText(source),
        html: formatNotificationHtml(source),
      }),
    );
  }

  if (!botToken) {
    return {
      outcome: 'channel_config',
      error: 'The Telegram bot token is missing or could not be decrypted.',
    };
  }

  return runWithDeadline(() =>
    sendNotificationTelegram(
      { botToken, chatId: settings.telegram.chatId },
      formatNotificationText(source),
    ),
  );
}

export async function deliverNotification(
  db: D1Database,
  record: NotificationDeliveryTarget,
  channels: NotificationChannel[],
  settings: NotificationSettings,
): Promise<NotificationPushOutcome> {
  const botToken = channels.includes('telegram') ? await readTelegramTokenSafely(db) : null;
  const source = buildNotificationMessageSource(record, settings.dashboardUrl);

  const results = await Promise.all(
    channels.map(async (channel) => ({
      channel,
      result: await sendToChannel(source, channel, settings, botToken),
    })),
  );

  for (const entry of results) {
    if (entry.result.outcome !== 'success') {
      console.error(
        `[notifications] push failed channel=${entry.channel} event=${record.event} error=${entry.result.error ?? entry.result.outcome}`,
      );
    }
  }

  const delivered = results.filter((entry) => entry.result.outcome === 'success');

  if (delivered.length > 0) {
    return {
      status: 'sent',
      channel: delivered.map((entry) => entry.channel).join(','),
      error: null,
      pushedAt: new Date().toISOString(),
    };
  }

  return {
    status: 'failed',
    channel: null,
    error: results
      .map((entry) => `${entry.channel}: ${entry.result.error ?? entry.result.outcome}`)
      .join('; ')
      .slice(0, MAX_PUSH_ERROR_LENGTH),
    pushedAt: null,
  };
}

export async function retryFailedNotificationPushes(
  db: D1Database,
  limit: number = NOTIFICATION_RETRY_BATCH,
): Promise<NotificationRetrySummary> {
  const settings = await readNotificationSettings(db);
  const records = await listRetryableNotifications(db, NOTIFICATION_MAX_PUSH_ATTEMPTS, limit);
  const summary: NotificationRetrySummary = { attempted: 0, sent: 0, failed: 0, skipped: 0 };

  for (const record of records) {
    summary.attempted += 1;

    const channels = selectNotificationChannels(
      settings,
      record.event,
      resolveNotificationRule(record.event).push,
    );

    if (channels.length === 0) {
      await setNotificationPushOutcome(db, record.id, {
        status: 'skipped',
        channel: null,
        error: null,
        pushedAt: null,
      });
      summary.skipped += 1;
      continue;
    }

    const outcome = await deliverNotification(db, record, channels, settings);
    await setNotificationPushOutcome(db, record.id, outcome);

    if (outcome.status === 'sent') {
      summary.sent += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}
