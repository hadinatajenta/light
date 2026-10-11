import { assertAllowedUrl } from '../../security/safe-fetch';
import {
  type AdapterOutcome,
  type AdapterResult,
  SHARE_MAX_RETRY_AFTER_MS,
  type ShareAdapter,
  type ShareSendRequest,
} from '../types';

const ERROR_MAX_LENGTH = 300;

export function buildMastodonIdempotencyKey(postId: string, channelId: string): string {
  return `share:${channelId}:${postId}`;
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

export function classifyMastodonFailure(status: number): AdapterOutcome {
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

function readStatusId(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    const id = (parsed as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export const mastodonAdapter: ShareAdapter = {
  async send(request: ShareSendRequest): Promise<AdapterResult> {
    const accessToken = request.config.accessToken;
    const instanceUrl = request.config.instanceUrl?.trim();
    if (!accessToken || !instanceUrl) {
      return {
        outcome: 'channel_config',
        error: 'The Mastodon channel is missing its instance URL or access token.',
      };
    }

    let origin: string;
    try {
      origin = assertAllowedUrl(instanceUrl, {
        rejectCode: 'INVALID_CHANNEL_CONFIG',
        label: 'Mastodon instance',
      })
        .toString()
        .replace(/\/+$/, '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'That Mastodon instance URL is not allowed.';
      return { outcome: 'channel_config', error: message };
    }

    const fetchImpl = request.fetchImpl ?? fetch;
    const idempotencyKey = buildMastodonIdempotencyKey(request.post.id, request.channel.id);

    let response: Response;
    try {
      response = await fetchImpl(`${origin}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ status: request.message.text }),
        redirect: 'error',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'transient', error: `Mastodon request failed: ${message}` };
    }

    const raw = await response.text().catch(() => '');

    if (response.ok) {
      return { outcome: 'success', providerPostId: readStatusId(raw) };
    }

    const error = raw.slice(0, ERROR_MAX_LENGTH);
    const outcome = classifyMastodonFailure(response.status);

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
