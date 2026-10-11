import {
  type AdapterOutcome,
  type AdapterResult,
  SHARE_MAX_RETRY_AFTER_MS,
  type ShareAdapter,
  type ShareSendRequest,
} from '../types';

const DISCORD_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'canary.discord.com',
  'ptb.discord.com',
  'discordapp.com',
]);
const ERROR_MAX_LENGTH = 300;

export function isAllowedDiscordWebhookUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === 'https:' && DISCORD_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase());
}

export function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const seconds = Number.parseInt(header, 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }

  return Math.min(seconds * 1000, SHARE_MAX_RETRY_AFTER_MS);
}

export function classifyDiscordFailure(status: number): AdapterOutcome {
  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 401 || status === 403 || status === 404) {
    return 'channel_config';
  }

  if (status >= 500) {
    return 'transient';
  }

  if (status >= 400) {
    return 'invalid_payload';
  }

  return 'transient';
}

export const discordAdapter: ShareAdapter = {
  async send(request: ShareSendRequest): Promise<AdapterResult> {
    const webhookUrl = request.config.webhookUrl;
    if (!webhookUrl || !isAllowedDiscordWebhookUrl(webhookUrl)) {
      return {
        outcome: 'channel_config',
        error: 'The Discord channel needs a webhook URL on a Discord domain.',
      };
    }

    const fetchImpl = request.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: request.message.text }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'transient', error: `Discord request failed: ${message}` };
    }

    if (response.status === 200 || response.status === 204) {
      return { outcome: 'success' };
    }

    const raw = await response.text().catch(() => '');
    const error = raw.slice(0, ERROR_MAX_LENGTH);
    const outcome = classifyDiscordFailure(response.status);

    if (outcome === 'rate_limited') {
      return {
        outcome,
        retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
        channelLevelRateLimit: true,
        error,
      };
    }

    return { outcome, error };
  },
};
