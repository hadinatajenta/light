import { describe, expect, it } from 'vitest';
import type { ShareSendRequest } from '../types';
import { classifyTelegramFailure, parseTelegramRetryAfterMs, telegramAdapter } from './telegram';

function request(overrides: Partial<ShareSendRequest> = {}): ShareSendRequest {
  return {
    channel: {
      id: 'c1',
      provider: 'telegram',
      label: 'Telegram',
      enabled: true,
      config: { chatId: '-100' },
      secretKeys: ['botToken'],
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
    config: { botToken: '123:abc', chatId: '-100' },
    post: {
      id: 'slug',
      title: 'Title',
      description: 'Description',
      body: 'Body',
      coverUrl: null,
      affiliate: false,
    },
    message: { text: '<b>Title</b>', photoUrl: null },
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

describe('classifyTelegramFailure', () => {
  it('maps status codes and descriptions', () => {
    expect(classifyTelegramFailure(429, '')).toBe('rate_limited');
    expect(classifyTelegramFailure(401, 'Unauthorized')).toBe('channel_config');
    expect(classifyTelegramFailure(400, 'Bad Request: chat not found')).toBe('channel_config');
    expect(classifyTelegramFailure(400, "Bad Request: can't parse entities")).toBe(
      'invalid_payload',
    );
    expect(classifyTelegramFailure(500, 'Internal')).toBe('transient');
    expect(classifyTelegramFailure(400, 'something odd')).toBe('transient');
  });
});

describe('parseTelegramRetryAfterMs', () => {
  it('prefers the body parameter and falls back to the header', () => {
    expect(parseTelegramRetryAfterMs('10', { parameters: { retry_after: 30 } })).toBe(30_000);
    expect(parseTelegramRetryAfterMs('15', null)).toBe(15_000);
    expect(parseTelegramRetryAfterMs(null, null)).toBeUndefined();
  });
});

describe('telegramAdapter', () => {
  it('sends a text message and returns the message id', async () => {
    const fetchImpl = (async (url: string) => {
      expect(url).toContain('/bot123:abc/sendMessage');
      return jsonResponse({ ok: true, result: { message_id: 42 } });
    }) as unknown as typeof fetch;

    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result).toEqual({ outcome: 'success', providerPostId: '42' });
  });

  it('sends a photo when a cover is present', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toContain('/sendPhoto');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.photo).toBe('https://cdn.example.com/a.jpg');
      return jsonResponse({ ok: true, result: { message_id: 7 } });
    }) as unknown as typeof fetch;

    const result = await telegramAdapter.send(
      request({ message: { text: 'cap', photoUrl: 'https://cdn.example.com/a.jpg' }, fetchImpl }),
    );
    expect(result.outcome).toBe('success');
  });

  it('maps 429 to rate_limited with retry-after and channel-level flag', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 429, parameters: { retry_after: 30 } },
        429,
      )) as unknown as typeof fetch;

    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result).toMatchObject({
      outcome: 'rate_limited',
      retryAfterMs: 30_000,
      channelLevelRateLimit: true,
    });
  });

  it('maps a missing chat to channel_config', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 400, description: 'chat not found' },
        400,
      )) as unknown as typeof fetch;

    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('channel_config');
  });

  it('maps an unparseable payload to invalid_payload', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 400, description: "can't parse entities" },
        400,
      )) as unknown as typeof fetch;

    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('invalid_payload');
  });

  it('maps a server error to transient', async () => {
    const fetchImpl = (async () => jsonResponse({ ok: false }, 500)) as unknown as typeof fetch;
    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
  });

  it('maps a network failure to transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await telegramAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('boom');
  });

  it('returns channel_config when the token is missing without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const result = await telegramAdapter.send(
      request({ config: { botToken: '', chatId: '-100' }, fetchImpl }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });
});
