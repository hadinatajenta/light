import type { AdapterOutcome, AdapterResult, ShareAdapter, ShareSendRequest } from '../types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const CHANNEL_ATTENTION_PATTERNS = [
  'chat not found',
  'bot was blocked',
  'bot is not a member',
  'not enough rights',
  'chat_id',
  'chat id',
  'user not found',
  'unauthorized',
  'invalid token',
  'forbidden',
];
const PAYLOAD_PATTERNS = [
  "can't parse",
  'cannot parse',
  'parse entities',
  'message is too long',
  'message text is empty',
  'message caption is empty',
  'wrong file identifier',
  'wrong remote file',
];

interface TelegramErrorBody {
  ok?: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
}

export function classifyTelegramFailure(status: number, description: string): AdapterOutcome {
  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 401 || status === 403 || status === 404) {
    return 'channel_config';
  }

  if (status >= 500) {
    return 'transient';
  }

  const text = description.toLowerCase();
  if (CHANNEL_ATTENTION_PATTERNS.some((pattern) => text.includes(pattern))) {
    return 'channel_config';
  }

  if (PAYLOAD_PATTERNS.some((pattern) => text.includes(pattern))) {
    return 'invalid_payload';
  }

  return 'transient';
}

export function parseTelegramRetryAfterMs(
  header: string | null,
  body: TelegramErrorBody | null,
): number | undefined {
  const fromBody = body?.parameters?.retry_after;
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody >= 0) {
    return fromBody * 1000;
  }

  if (header) {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  return undefined;
}

function buildEndpoint(token: string, method: string): string {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

function buildBody(request: ShareSendRequest): {
  method: string;
  payload: Record<string, unknown>;
} {
  const chatId = request.config.chatId;
  const photoUrl = request.message.photoUrl;

  if (photoUrl) {
    return {
      method: 'sendPhoto',
      payload: {
        chat_id: chatId,
        photo: photoUrl,
        caption: request.message.text,
        parse_mode: 'HTML',
      },
    };
  }

  return {
    method: 'sendMessage',
    payload: {
      chat_id: chatId,
      text: request.message.text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
  };
}

function readErrorBody(raw: string): TelegramErrorBody | null {
  try {
    const parsed = JSON.parse(raw) as TelegramErrorBody;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export const telegramAdapter: ShareAdapter = {
  async send(request: ShareSendRequest): Promise<AdapterResult> {
    const token = request.config.botToken;
    if (!token || !request.config.chatId) {
      return {
        outcome: 'channel_config',
        error: 'The Telegram channel is missing its token or chat id.',
      };
    }

    const { method, payload } = buildBody(request);
    const fetchImpl = request.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await fetchImpl(buildEndpoint(token, method), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'transient', error: `Telegram request failed: ${message}` };
    }

    const raw = await response.text().catch(() => '');
    const body = readErrorBody(raw);

    if (response.ok && body?.ok !== false) {
      const messageId = body?.result?.message_id;
      return {
        outcome: 'success',
        providerPostId: typeof messageId === 'number' ? String(messageId) : undefined,
      };
    }

    const description = body?.description ?? raw.slice(0, 300);
    const outcome = classifyTelegramFailure(response.status, description);

    if (outcome === 'rate_limited') {
      return {
        outcome,
        retryAfterMs: parseTelegramRetryAfterMs(response.headers.get('Retry-After'), body),
        channelLevelRateLimit: true,
        error: description,
      };
    }

    return { outcome, error: description };
  },
};
