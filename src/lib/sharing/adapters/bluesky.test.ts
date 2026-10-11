import { beforeEach, describe, expect, it } from 'vitest';
import type { ShareSendRequest } from '../types';
import {
  blueskyAdapter,
  buildBlueskyRecordKey,
  buildLinkFacet,
  resetBlueskySessionCache,
} from './bluesky';

const SERVICE = 'https://bsky.social';
const URL = 'https://lightscripts.com/blog/slug';

function request(overrides: Partial<ShareSendRequest> = {}): ShareSendRequest {
  return {
    channel: {
      id: 'c1',
      provider: 'bluesky',
      label: 'Bluesky',
      enabled: true,
      config: { identifier: 'me.bsky.social', service: SERVICE },
      secretKeys: ['appPassword'],
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
    config: { identifier: 'me.bsky.social', service: SERVICE, appPassword: 'pw' },
    post: {
      id: 'slug',
      title: 'Title',
      description: 'Description',
      body: 'Body',
      coverUrl: null,
      affiliate: false,
    },
    message: { text: `Title\n\n${URL}`, photoUrl: null },
    url: URL,
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

const CREATE_SESSION_PATH = '/xrpc/com.atproto.server.createSession';
const PUT_RECORD_PATH = '/xrpc/com.atproto.repo.putRecord';

beforeEach(() => {
  resetBlueskySessionCache();
});

describe('buildLinkFacet', () => {
  it('uses utf-8 byte offsets that account for multi-byte characters', () => {
    const text = `hi \u{1f44b} ${URL}`;
    const facet = buildLinkFacet(text, URL);
    const encoder = new TextEncoder();
    const expectedStart = encoder.encode(`hi \u{1f44b} `).length;

    expect(facet).toEqual({
      index: { byteStart: expectedStart, byteEnd: expectedStart + encoder.encode(URL).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: URL }],
    });
    expect(facet?.index.byteStart).toBe(8);
  });

  it('returns null when the url is absent', () => {
    expect(buildLinkFacet('no link here', URL)).toBeNull();
  });
});

describe('buildBlueskyRecordKey', () => {
  it('is stable, valid, and tid-like', () => {
    const key = buildBlueskyRecordKey('slug', 'chan');
    expect(key).toBe(buildBlueskyRecordKey('slug', 'chan'));
    expect(key).toMatch(/^[234567a-z]{13}$/);
    expect(buildBlueskyRecordKey('other', 'chan')).not.toBe(key);
  });
});

describe('blueskyAdapter', () => {
  it('creates a session, puts a record, and returns the post uri', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.identifier).toBe('me.bsky.social');
        expect(body.password).toBe('pw');
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc', handle: 'me.bsky.social' });
      }

      if (url.endsWith(PUT_RECORD_PATH)) {
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer jwt-1');
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.repo).toBe('did:plc:abc');
        expect(body.collection).toBe('app.bsky.feed.post');
        expect(body.rkey).toBe(buildBlueskyRecordKey('slug', 'c1'));

        const record = body.record as Record<string, unknown>;
        const text = record.text as string;
        expect(text).toContain(URL);
        expect(record.facets).toEqual([buildLinkFacet(text, URL)]);
        expect((record.embed as Record<string, unknown>).external).toMatchObject({ uri: URL });
        return jsonResponse({ uri: 'at://did:plc:abc/app.bsky.feed.post/rk', cid: 'cid' });
      }

      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result).toEqual({
      outcome: 'success',
      providerPostId: 'at://did:plc:abc/app.bsky.feed.post/rk',
    });
  });

  it('reuses the cached session across sends', async () => {
    let createSessionCalls = 0;
    let putRecordCalls = 0;

    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        createSessionCalls += 1;
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      putRecordCalls += 1;
      return jsonResponse({ uri: 'at://did:plc:abc/app.bsky.feed.post/rk', cid: 'cid' });
    }) as unknown as typeof fetch;

    await blueskyAdapter.send(request({ fetchImpl }));
    await blueskyAdapter.send(request({ fetchImpl, post: { ...request().post, id: 'other' } }));

    expect(createSessionCalls).toBe(1);
    expect(putRecordCalls).toBe(2);
  });

  it('refreshes the session once when the token has expired', async () => {
    let createSessionCalls = 0;
    let putRecordCalls = 0;

    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        createSessionCalls += 1;
        return jsonResponse({ accessJwt: `jwt-${createSessionCalls}`, did: 'did:plc:abc' });
      }

      putRecordCalls += 1;
      if (putRecordCalls === 1) {
        return jsonResponse({ error: 'ExpiredToken', message: 'Token has expired' }, 400);
      }

      return jsonResponse({ uri: 'at://did:plc:abc/app.bsky.feed.post/rk', cid: 'cid' });
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('success');
    expect(createSessionCalls).toBe(2);
    expect(putRecordCalls).toBe(2);
  });

  it('maps an invalid token to channel_config', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      return jsonResponse({ error: 'InvalidToken', message: 'Bad token' }, 400);
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('channel_config');
  });

  it('maps a 401 putRecord to channel_config', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      return jsonResponse({ error: 'AuthenticationRequired' }, 401);
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('channel_config');
  });

  it('maps a 400 record problem to invalid_payload', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      return jsonResponse({ error: 'InvalidRequest', message: 'Text too long' }, 400);
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('invalid_payload');
  });

  it('maps a 429 putRecord to rate_limited with Retry-After', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      return jsonResponse({ error: 'RateLimitExceeded' }, 429, { 'Retry-After': '45' });
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result).toMatchObject({
      outcome: 'rate_limited',
      retryAfterMs: 45_000,
      channelLevelRateLimit: true,
    });
  });

  it('maps a session 401 to channel_config without a putRecord', async () => {
    let putRecordCalls = 0;
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ error: 'AuthenticationRequired' }, 401);
      }

      putRecordCalls += 1;
      return jsonResponse({ uri: 'at://x' });
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('channel_config');
    expect(putRecordCalls).toBe(0);
  });

  it('maps a 5xx to transient', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith(CREATE_SESSION_PATH)) {
        return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
      }

      return jsonResponse({ error: 'InternalServerError' }, 500);
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
  });

  it('maps a network failure to transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('boom');
  });

  it('rejects a non-https service without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(
      request({
        config: { identifier: 'me.bsky.social', service: 'http://bsky.social', appPassword: 'pw' },
        fetchImpl,
      }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });

  it('returns channel_config when the identifier or password is missing without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ accessJwt: 'jwt-1', did: 'did:plc:abc' });
    }) as unknown as typeof fetch;

    const result = await blueskyAdapter.send(
      request({ config: { identifier: 'me.bsky.social', service: SERVICE }, fetchImpl }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });
});
