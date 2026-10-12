import { classifyTelegramFailure, readErrorBody } from '../../sharing/adapters/telegram';
import type { NotificationChannelResult } from './types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ERROR_LENGTH = 300;

export interface TelegramNotificationConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramSendOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function buildTelegramNotificationEndpoint(botToken: string): string {
  return `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
}

export async function sendNotificationTelegram(
  config: TelegramNotificationConfig,
  text: string,
  options: TelegramSendOptions = {},
): Promise<NotificationChannelResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(buildTelegramNotificationEndpoint(config.botToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      outcome: 'transient',
      error: `Telegram request failed: ${detail}`.slice(0, MAX_ERROR_LENGTH),
    };
  }

  const raw = await response.text().catch(() => '');
  const body = readErrorBody(raw);

  if (response.ok && body?.ok !== false) {
    const messageId = body?.result?.message_id;

    return {
      outcome: 'success',
      providerId: typeof messageId === 'number' ? String(messageId) : undefined,
    };
  }

  const description = body?.description ?? raw.slice(0, MAX_ERROR_LENGTH);

  return {
    outcome: classifyTelegramFailure(response.status, description),
    error: description.slice(0, MAX_ERROR_LENGTH),
  };
}
