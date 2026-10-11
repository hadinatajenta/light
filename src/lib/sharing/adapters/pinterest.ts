import { deriveShareBlurb, truncateToCodePoints } from '../templates';
import {
  type AdapterOutcome,
  type AdapterResult,
  SHARE_MAX_RETRY_AFTER_MS,
  type ShareAdapter,
  type ShareSendRequest,
} from '../types';

const PINTEREST_PINS_URL = 'https://api.pinterest.com/v5/pins';
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const ERROR_MAX_LENGTH = 300;

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

export function classifyPinterestFailure(status: number): AdapterOutcome {
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

function readPinId(raw: string): string | undefined {
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

function buildPinBody(request: ShareSendRequest, boardId: string, imageUrl: string) {
  return {
    board_id: boardId,
    media_source: { source_type: 'image_url', url: imageUrl },
    title: truncateToCodePoints(request.post.title.trim() || request.post.id, TITLE_MAX_LENGTH),
    description: truncateToCodePoints(deriveShareBlurb(request.post), DESCRIPTION_MAX_LENGTH),
    link: request.url,
  };
}

export const pinterestAdapter: ShareAdapter = {
  async send(request: ShareSendRequest): Promise<AdapterResult> {
    const accessToken = request.config.accessToken;
    const boardId = request.config.boardId?.trim();
    if (!accessToken || !boardId) {
      return {
        outcome: 'channel_config',
        error: 'The Pinterest channel is missing its board id or access token.',
      };
    }

    const imageUrl = request.message.photoUrl;
    if (!imageUrl) {
      return { outcome: 'transient', error: 'Pinterest needs a cover image.' };
    }

    const fetchImpl = request.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await fetchImpl(PINTEREST_PINS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPinBody(request, boardId, imageUrl)),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'transient', error: `Pinterest request failed: ${message}` };
    }

    const raw = await response.text().catch(() => '');

    if (response.ok) {
      return { outcome: 'success', providerPostId: readPinId(raw) };
    }

    const error = raw.slice(0, ERROR_MAX_LENGTH);
    const outcome = classifyPinterestFailure(response.status);

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
