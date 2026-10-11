import { assertAllowedUrl } from '../../security/safe-fetch';
import { deriveShareBlurb, truncateToGraphemes } from '../templates';
import {
  type AdapterOutcome,
  type AdapterResult,
  SHARE_MAX_RETRY_AFTER_MS,
  type ShareAdapter,
  type ShareSendRequest,
} from '../types';

const DEFAULT_SERVICE = 'https://bsky.social';
const POST_COLLECTION = 'app.bsky.feed.post';
const SESSION_TTL_MS = 90 * 60 * 1000;
const ERROR_MAX_LENGTH = 300;
const RECORD_KEY_LENGTH = 13;
const BASE32_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;
const EMBED_FIELD_LIMIT = 300;

export interface BlueskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri: string }>;
}

interface BlueskySession {
  accessJwt: string;
  did: string;
}

interface SessionFailure {
  outcome: AdapterOutcome;
  error: string;
  retryAfterMs?: number;
  channelLevelRateLimit?: boolean;
}

type SessionResult = { session: BlueskySession } | SessionFailure;

type PutResult =
  | { kind: 'success'; providerPostId?: string }
  | { kind: 'expired' }
  | {
      kind: 'failure';
      outcome: AdapterOutcome;
      error?: string;
      retryAfterMs?: number;
      channelLevelRateLimit?: boolean;
    };

const sessionCache = new Map<string, { session: BlueskySession; expiresAt: number }>();

export function resetBlueskySessionCache(): void {
  sessionCache.clear();
}

function fnv1a64(input: string): bigint {
  let hash = FNV64_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }

  return hash;
}

function encodeBase32(value: bigint, length: number): string {
  let remaining = value;
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    chars.unshift(BASE32_ALPHABET[Number(remaining & 0x1fn)]);
    remaining >>= 5n;
  }

  return chars.join('');
}

export function buildBlueskyRecordKey(postId: string, channelId: string): string {
  return encodeBase32(fnv1a64(`${channelId}:${postId}`), RECORD_KEY_LENGTH);
}

export function buildLinkFacet(text: string, url: string): BlueskyFacet | null {
  const start = text.indexOf(url);
  if (start < 0) {
    return null;
  }

  const encoder = new TextEncoder();
  const byteStart = encoder.encode(text.slice(0, start)).length;
  const byteEnd = byteStart + encoder.encode(url).length;

  return {
    index: { byteStart, byteEnd },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
  };
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

function readJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readCachedSession(identifier: string): BlueskySession | null {
  const entry = sessionCache.get(identifier);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    sessionCache.delete(identifier);
    return null;
  }

  return entry.session;
}

function writeCachedSession(identifier: string, session: BlueskySession): void {
  sessionCache.set(identifier, { session, expiresAt: Date.now() + SESSION_TTL_MS });
}

function toAdapterResult(failure: SessionFailure): AdapterResult {
  return {
    outcome: failure.outcome,
    error: failure.error,
    retryAfterMs: failure.retryAfterMs,
    channelLevelRateLimit: failure.channelLevelRateLimit,
  };
}

async function createSession(
  fetchImpl: typeof fetch,
  service: string,
  identifier: string,
  appPassword: string,
  timeoutMs: number,
): Promise<SessionResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: appPassword }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      outcome: 'transient',
      error: `Bluesky session request failed: ${errorMessage(error)}`,
    };
  }

  const raw = await response.text().catch(() => '');
  const body = readJson(raw);

  if (response.ok) {
    const accessJwt = body?.accessJwt;
    const did = body?.did;
    if (typeof accessJwt === 'string' && typeof did === 'string') {
      return { session: { accessJwt, did } };
    }

    return { outcome: 'channel_config', error: 'Bluesky did not return a usable session.' };
  }

  if (response.status === 429) {
    return {
      outcome: 'rate_limited',
      retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
      channelLevelRateLimit: true,
      error: raw.slice(0, ERROR_MAX_LENGTH),
    };
  }

  if (response.status >= 500) {
    return {
      outcome: 'transient',
      error: raw.slice(0, ERROR_MAX_LENGTH) || 'The Bluesky session request failed.',
    };
  }

  return {
    outcome: 'channel_config',
    error: raw.slice(0, ERROR_MAX_LENGTH) || 'Bluesky rejected the app password.',
  };
}

function classifyPutFailure(status: number, providerError: string, error: string): PutResult {
  if (status >= 500) {
    return { kind: 'failure', outcome: 'transient', error };
  }

  if (status === 400) {
    if (providerError === 'InvalidToken' || providerError === 'AuthenticationRequired') {
      return { kind: 'failure', outcome: 'channel_config', error };
    }

    return { kind: 'failure', outcome: 'invalid_payload', error };
  }

  if (status >= 400) {
    return { kind: 'failure', outcome: 'invalid_payload', error };
  }

  return { kind: 'failure', outcome: 'transient', error };
}

async function putRecord(
  fetchImpl: typeof fetch,
  service: string,
  session: BlueskySession,
  recordKey: string,
  record: Record<string, unknown>,
  timeoutMs: number,
): Promise<PutResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${service}/xrpc/com.atproto.repo.putRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: POST_COLLECTION,
        rkey: recordKey,
        record,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      kind: 'failure',
      outcome: 'transient',
      error: `Bluesky request failed: ${errorMessage(error)}`,
    };
  }

  const raw = await response.text().catch(() => '');
  const body = readJson(raw);
  const providerError = typeof body?.error === 'string' ? body.error : '';

  if (response.ok) {
    const uri = body?.uri;
    return { kind: 'success', providerPostId: typeof uri === 'string' ? uri : undefined };
  }

  if (
    response.status === 400 &&
    (providerError === 'ExpiredToken' || providerError === 'ExpiredRefreshToken')
  ) {
    return { kind: 'expired' };
  }

  if (response.status === 429) {
    return {
      kind: 'failure',
      outcome: 'rate_limited',
      retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
      channelLevelRateLimit: true,
      error: raw.slice(0, ERROR_MAX_LENGTH),
    };
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { kind: 'failure', outcome: 'channel_config', error: raw.slice(0, ERROR_MAX_LENGTH) };
  }

  return classifyPutFailure(response.status, providerError, raw.slice(0, ERROR_MAX_LENGTH));
}

function buildRecord(request: ShareSendRequest): Record<string, unknown> {
  const text = request.message.text;
  const record: Record<string, unknown> = {
    $type: POST_COLLECTION,
    text,
    createdAt: new Date().toISOString(),
  };

  const facet = buildLinkFacet(text, request.url);
  if (facet) {
    record.facets = [facet];
  }

  record.embed = {
    $type: 'app.bsky.embed.external',
    external: {
      uri: request.url,
      title: truncateToGraphemes(request.post.title.trim(), EMBED_FIELD_LIMIT) || request.post.id,
      description: truncateToGraphemes(deriveShareBlurb(request.post), EMBED_FIELD_LIMIT),
    },
  };

  return record;
}

export const blueskyAdapter: ShareAdapter = {
  async send(request: ShareSendRequest): Promise<AdapterResult> {
    const identifier = request.config.identifier?.trim();
    const appPassword = request.config.appPassword;
    const serviceRaw = request.config.service?.trim() || DEFAULT_SERVICE;

    if (!identifier || !appPassword) {
      return {
        outcome: 'channel_config',
        error: 'The Bluesky channel is missing its identifier or app password.',
      };
    }

    let service: string;
    try {
      service = assertAllowedUrl(serviceRaw, {
        rejectCode: 'INVALID_CHANNEL_CONFIG',
        label: 'Bluesky service',
      })
        .toString()
        .replace(/\/+$/, '');
    } catch (error) {
      return { outcome: 'channel_config', error: errorMessage(error) };
    }

    const fetchImpl = request.fetchImpl ?? fetch;

    let session = readCachedSession(identifier);
    if (!session) {
      const created = await createSession(
        fetchImpl,
        service,
        identifier,
        appPassword,
        request.timeoutMs,
      );
      if (!('session' in created)) {
        return toAdapterResult(created);
      }

      session = created.session;
      writeCachedSession(identifier, session);
    }

    const recordKey = buildBlueskyRecordKey(request.post.id, request.channel.id);
    const record = buildRecord(request);

    let result = await putRecord(fetchImpl, service, session, recordKey, record, request.timeoutMs);

    if (result.kind === 'expired') {
      sessionCache.delete(identifier);
      const refreshed = await createSession(
        fetchImpl,
        service,
        identifier,
        appPassword,
        request.timeoutMs,
      );
      if (!('session' in refreshed)) {
        return toAdapterResult(refreshed);
      }

      session = refreshed.session;
      writeCachedSession(identifier, session);
      result = await putRecord(fetchImpl, service, session, recordKey, record, request.timeoutMs);

      if (result.kind === 'expired') {
        sessionCache.delete(identifier);
        return { outcome: 'channel_config', error: 'The Bluesky session could not be refreshed.' };
      }
    }

    if (result.kind === 'failure') {
      return {
        outcome: result.outcome,
        error: result.error,
        retryAfterMs: result.retryAfterMs,
        channelLevelRateLimit: result.channelLevelRateLimit,
      };
    }

    return { outcome: 'success', providerPostId: result.providerPostId };
  },
};
