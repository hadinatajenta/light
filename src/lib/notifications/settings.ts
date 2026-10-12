import { decryptSecret, encryptSecret, maskSecret } from '../agents/secrets';
import { ApiError } from '../errors';
import { getSetting, setSetting } from '../settings/store';
import { NOTIFICATION_EVENTS } from './types';

export const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
export const DEFAULT_NOTIFICATION_SENDER = 'notify@lightscripts.com';
export const DEFAULT_NOTIFICATION_DASHBOARD_URL = 'https://admin.hadinata.me';

export interface EmailNotificationSettings {
  enabled: boolean;
  recipient: string;
  sender: string;
}

export interface TelegramNotificationSettings {
  enabled: boolean;
  chatId: string;
  hasBotToken: boolean;
}

export interface NotificationSettings {
  dashboardUrl: string;
  email: EmailNotificationSettings;
  telegram: TelegramNotificationSettings;
  events: Record<string, boolean>;
}

export interface NotificationSettingsView {
  dashboardUrl: string;
  email: EmailNotificationSettings;
  telegram: TelegramNotificationSettings & { botTokenHint: string | null };
  events: Record<string, boolean>;
}

export interface NotificationSettingsInput {
  dashboardUrl: string;
  email: EmailNotificationSettings;
  telegram: { enabled: boolean; chatId: string; botToken?: string };
  events: Record<string, boolean>;
}

interface StoredNotificationSettings {
  dashboardUrl?: string;
  email?: Partial<EmailNotificationSettings>;
  telegram?: { enabled?: boolean; chatId?: string; botToken?: string };
  events?: Record<string, unknown>;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dashboardUrl: DEFAULT_NOTIFICATION_DASHBOARD_URL,
  email: { enabled: false, recipient: '', sender: DEFAULT_NOTIFICATION_SENDER },
  telegram: { enabled: false, chatId: '', hasBotToken: false },
  events: {},
};

function readStoredSettings(raw: string | null): StoredNotificationSettings {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as StoredNotificationSettings;
  } catch {
    return {};
  }
}

export function normalizeNotificationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeNotificationDashboardUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed === '' ? DEFAULT_NOTIFICATION_DASHBOARD_URL : trimmed;
}

export function normalizeNotificationEvents(
  events: Record<string, unknown> | undefined,
): Record<string, boolean> {
  const normalized: Record<string, boolean> = {};

  for (const event of NOTIFICATION_EVENTS) {
    const value = events?.[event];
    if (typeof value === 'boolean') {
      normalized[event] = value;
    }
  }

  return normalized;
}

export async function readNotificationSettings(db: D1Database): Promise<NotificationSettings> {
  const stored = readStoredSettings(await getSetting(db, NOTIFICATION_SETTINGS_KEY));

  return {
    dashboardUrl: normalizeNotificationDashboardUrl(
      stored.dashboardUrl ?? DEFAULT_NOTIFICATION_DASHBOARD_URL,
    ),
    email: {
      enabled: stored.email?.enabled === true,
      recipient: normalizeNotificationEmail(stored.email?.recipient ?? ''),
      sender: normalizeNotificationEmail(stored.email?.sender ?? DEFAULT_NOTIFICATION_SENDER),
    },
    telegram: {
      enabled: stored.telegram?.enabled === true,
      chatId: (stored.telegram?.chatId ?? '').trim(),
      hasBotToken: Boolean(stored.telegram?.botToken),
    },
    events: normalizeNotificationEvents(stored.events),
  };
}

export async function readTelegramBotToken(db: D1Database): Promise<string | null> {
  const stored = readStoredSettings(await getSetting(db, NOTIFICATION_SETTINGS_KEY));
  const payload = stored.telegram?.botToken;

  return payload ? decryptSecret(payload) : null;
}

export async function describeNotificationSettings(
  db: D1Database,
): Promise<NotificationSettingsView> {
  const settings = await readNotificationSettings(db);
  const botToken = await readTelegramBotToken(db);

  return {
    dashboardUrl: settings.dashboardUrl,
    email: settings.email,
    telegram: {
      ...settings.telegram,
      botTokenHint: botToken ? maskSecret(botToken) : null,
    },
    events: settings.events,
  };
}

export async function saveNotificationSettings(
  db: D1Database,
  input: NotificationSettingsInput,
): Promise<NotificationSettingsView> {
  const stored = readStoredSettings(await getSetting(db, NOTIFICATION_SETTINGS_KEY));

  const recipient = normalizeNotificationEmail(input.email.recipient);
  const sender = normalizeNotificationEmail(input.email.sender);
  const chatId = input.telegram.chatId.trim();
  const submittedToken = input.telegram.botToken?.trim() ?? '';
  const existingToken = stored.telegram?.botToken;

  if (input.email.enabled && recipient === '') {
    throw new ApiError(
      422,
      'NOTIFICATION_EMAIL_RECIPIENT_MISSING',
      'An email recipient is required to enable email notifications.',
    );
  }

  if (input.telegram.enabled && (chatId === '' || (!submittedToken && !existingToken))) {
    throw new ApiError(
      422,
      'NOTIFICATION_TELEGRAM_CONFIG_MISSING',
      'A Telegram chat id and bot token are required to enable Telegram notifications.',
    );
  }

  const next: StoredNotificationSettings = {
    dashboardUrl: normalizeNotificationDashboardUrl(input.dashboardUrl),
    email: { enabled: input.email.enabled, recipient, sender },
    telegram: {
      enabled: input.telegram.enabled,
      chatId,
      ...(submittedToken
        ? { botToken: await encryptSecret(submittedToken) }
        : existingToken
          ? { botToken: existingToken }
          : {}),
    },
    events: normalizeNotificationEvents(input.events),
  };

  await setSetting(db, NOTIFICATION_SETTINGS_KEY, JSON.stringify(next));

  return describeNotificationSettings(db);
}
