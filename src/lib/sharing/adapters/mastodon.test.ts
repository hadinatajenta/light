import { describe, expect, it } from 'vitest';
import type { ShareSendRequest } from '../types';
import { buildMastodonIdempotencyKey, classifyMastodonFailure, mastodonAdapter } from './mastodon';

const INSTANCE = 'https://mastodon.example';

function request(overrides: Partial<ShareSendRequest> = {}): ShareSendRequest {
  return {
    channel: {
      id: 'c1',
      provider: 'mastodon',
      label: 'Mastodon',
      enabled: true,
      config: { instanceUrl: INSTANCE },
      secretKeys: ['accessToken'],
      dailyCap: null,
      requireApproval: false,
      needsAttention: false,
      pausedUntil: null,
      startedAt: null,
      lastError: null,
      lastSuccessAt: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    },
    config: { instanceUrl: INSTANCE, accessToken: 'token-1' },
    post: {
      id: 'slug',
      title: 'Title',
      description: 'Description',
      body: 'Body',
      coverUrl: null,
      affiliate: false,
    },
    message: { text: 'Title\n\nhttps://lightscripts.com/blog/slug', photoUrl: null },
    url: 'https://lightscripts.com/blog/slug',
    timeoutMs: 5000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('buildMastodonIdempotencyKey', () => {
  it('is stable and derived from the post and channel', () => {
    expect(buildMastodonIdempotencyKey('slug', 'chan')).toBe('share:chan:slug');
    expect(buildMastodonIdempotencyKey('slug', 'chan')).toBe(
      buildMastodonIdempotencyKey('slug', 'chan'),
    );
    expect(buildMastodonIdempotencyKey('slug', 'chan')).not.toBe(
      buildMastodonIdempotencyKey('other', 'chan'),
    );
  });
});

describe('classifyMastodonFailure', () => {
  it('maps status codes', () => {
    expect(classifyMastodonFailure(429)).toBe('rate_limited');
    expect(classifyMastodonFailure(401)).toBe('channel_config');
    expect(classifyMastodonFailure(403)).toBe('channel_config');
    expect(classifyMastodonFailure(404)).toBe('channel_config');
    expect(classifyMastodonFailure(422)).toBe('invalid_payload');
    expect(classifyMastodonFailure(500)).toBe('transient');
  });
});

describe('mastodonAdapter', () => {
  it('posts the status with auth and idempotency headers', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe(`${INSTANCE}/api/v1/statuses`);
      expect(init.redirect).toBe('error');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token-1');
      expect(headers['Idempotency-Key']).toBe('share:c1:slug');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.status).toContain('https://lightscripts.com/blog/slug');
      return jsonResponse({ id: '110500000000000001' });
    }) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result).toEqual({ outcome: 'success', providerPostId: '110500000000000001' });
  });

  it('maps 401 and 404 to channel_config', async () => {
    const unauthorized = (async () =>
      jsonResponse({ error: 'The access token is invalid' }, 401)) as unknown as typeof fetch;
    const missing = (async () =>
      jsonResponse({ error: 'Record not found' }, 404)) as unknown as typeof fetch;

    expect((await mastodonAdapter.send(request({ fetchImpl: unauthorized }))).outcome).toBe(
      'channel_config',
    );
    expect((await mastodonAdapter.send(request({ fetchImpl: missing }))).outcome).toBe(
      'channel_config',
    );
  });

  it('maps 422 to invalid_payload', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: 'Validation failed: Text can\u2019t be blank' },
        422,
      )) as unknown as typeof fetch;
    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('invalid_payload');
  });

  it('maps 429 to rate_limited with Retry-After', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'Too many requests' }, 429, {
        'Retry-After': '30',
      })) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result).toMatchObject({
      outcome: 'rate_limited',
      retryAfterMs: 30_000,
      channelLevelRateLimit: true,
    });
  });

  it('caps Retry-After at one hour', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'Too many requests' }, 429, {
        'Retry-After': '99999',
      })) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result.retryAfterMs).toBe(3_600_000);
  });

  it('maps 5xx to transient', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'oops' }, 503)) as unknown as typeof fetch;
    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
  });

  it('maps a network failure to transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('boom');
  });

  it('rejects a non-https instance without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ id: '1' });
    }) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(
      request({ config: { instanceUrl: 'http://mastodon.example', accessToken: 't' }, fetchImpl }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });

  it('rejects an IP-literal instance without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ id: '1' });
    }) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(
      request({ config: { instanceUrl: 'https://127.0.0.1', accessToken: 't' }, fetchImpl }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });

  it('returns channel_config when config is missing without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ id: '1' });
    }) as unknown as typeof fetch;

    const result = await mastodonAdapter.send(request({ config: {}, fetchImpl }));
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });
});
