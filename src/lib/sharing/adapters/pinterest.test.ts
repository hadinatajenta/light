import { describe, expect, it } from 'vitest';
import type { ShareSendRequest } from '../types';
import { classifyPinterestFailure, parseRetryAfterMs, pinterestAdapter } from './pinterest';

const COVER_URL = 'https://cdn.example.com/cover.jpg';

function request(overrides: Partial<ShareSendRequest> = {}): ShareSendRequest {
  return {
    channel: {
      id: 'c1',
      provider: 'pinterest',
      label: 'Pinterest',
      enabled: true,
      config: { boardId: 'board-1' },
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
    config: { boardId: 'board-1', accessToken: 'token-1' },
    post: {
      id: 'slug',
      title: 'Title',
      description: 'Description',
      body: 'Body',
      coverUrl: COVER_URL,
      affiliate: false,
    },
    message: { text: 'Title\n\nhttps://lightscripts.com/blog/slug', photoUrl: COVER_URL },
    url: 'https://lightscripts.com/blog/slug?utm_source=pinterest&utm_medium=social',
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

describe('classifyPinterestFailure', () => {
  it('maps status codes', () => {
    expect(classifyPinterestFailure(429)).toBe('rate_limited');
    expect(classifyPinterestFailure(401)).toBe('channel_config');
    expect(classifyPinterestFailure(403)).toBe('channel_config');
    expect(classifyPinterestFailure(404)).toBe('channel_config');
    expect(classifyPinterestFailure(422)).toBe('invalid_payload');
    expect(classifyPinterestFailure(500)).toBe('transient');
  });
});

describe('parseRetryAfterMs', () => {
  it('parses seconds and caps at one hour', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000);
    expect(parseRetryAfterMs('99999')).toBe(3_600_000);
    expect(parseRetryAfterMs(null)).toBeUndefined();
  });
});

describe('pinterestAdapter', () => {
  it('creates a pin and returns the provider id', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.pinterest.com/v5/pins');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token-1');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.board_id).toBe('board-1');
      expect(body.link).toBe(
        'https://lightscripts.com/blog/slug?utm_source=pinterest&utm_medium=social',
      );
      expect(body.media_source).toEqual({ source_type: 'image_url', url: COVER_URL });
      expect(body.title).toBe('Title');
      expect(body.description).toBe('Description');
      return jsonResponse({ id: 'pin-42' }, 201);
    }) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(request({ fetchImpl }));
    expect(result).toEqual({ outcome: 'success', providerPostId: 'pin-42' });
  });

  it('truncates the title to 100 characters and the description to 500', async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect((body.title as string).length).toBe(100);
      expect((body.description as string).length).toBe(500);
      return jsonResponse({ id: 'pin-1' }, 201);
    }) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(
      request({
        post: {
          id: 'slug',
          title: 'T'.repeat(150),
          description: 'D'.repeat(600),
          body: 'Body',
          coverUrl: COVER_URL,
          affiliate: false,
        },
        fetchImpl,
      }),
    );
    expect(result.outcome).toBe('success');
  });

  it('maps 401, 403 and 404 to channel_config', async () => {
    const unauthorized = (async () =>
      jsonResponse({ message: 'Unauthorized' }, 401)) as unknown as typeof fetch;
    const forbidden = (async () =>
      jsonResponse({ message: 'Forbidden' }, 403)) as unknown as typeof fetch;
    const missing = (async () =>
      jsonResponse({ message: 'Board not found' }, 404)) as unknown as typeof fetch;

    expect((await pinterestAdapter.send(request({ fetchImpl: unauthorized }))).outcome).toBe(
      'channel_config',
    );
    expect((await pinterestAdapter.send(request({ fetchImpl: forbidden }))).outcome).toBe(
      'channel_config',
    );
    expect((await pinterestAdapter.send(request({ fetchImpl: missing }))).outcome).toBe(
      'channel_config',
    );
  });

  it('maps 422 to invalid_payload', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ message: 'Invalid pin' }, 422)) as unknown as typeof fetch;
    const result = await pinterestAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('invalid_payload');
  });

  it('maps 429 to rate_limited with Retry-After', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ message: 'Too many requests' }, 429, {
        'Retry-After': '30',
      })) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(request({ fetchImpl }));
    expect(result).toMatchObject({
      outcome: 'rate_limited',
      retryAfterMs: 30_000,
      channelLevelRateLimit: true,
    });
  });

  it('maps 5xx to transient', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ message: 'oops' }, 503)) as unknown as typeof fetch;
    const result = await pinterestAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
  });

  it('maps a network failure to transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('boom');
  });

  it('returns transient with a cover hint when no image is present without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ id: 'pin-1' }, 201);
    }) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(
      request({ message: { text: 'Title', photoUrl: null }, fetchImpl }),
    );
    expect(result).toMatchObject({ outcome: 'transient', error: 'Pinterest needs a cover image.' });
    expect(called).toBe(false);
  });

  it('returns channel_config when config is missing without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ id: 'pin-1' }, 201);
    }) as unknown as typeof fetch;

    const result = await pinterestAdapter.send(request({ config: {}, fetchImpl }));
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });
});
