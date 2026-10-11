import { describe, expect, it } from 'vitest';
import type { ShareSendRequest } from '../types';
import { classifyDiscordFailure, discordAdapter, isAllowedDiscordWebhookUrl } from './discord';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

function request(overrides: Partial<ShareSendRequest> = {}): ShareSendRequest {
  return {
    channel: {
      id: 'c1',
      provider: 'discord',
      label: 'Discord',
      enabled: true,
      config: {},
      secretKeys: ['webhookUrl'],
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
    config: { webhookUrl: WEBHOOK_URL },
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

function textResponse(body: string | null, status = 200): Response {
  return new Response(body, { status });
}

describe('isAllowedDiscordWebhookUrl', () => {
  it('accepts the Discord webhook hosts over https only', () => {
    expect(isAllowedDiscordWebhookUrl('https://discord.com/api/webhooks/1/a')).toBe(true);
    expect(isAllowedDiscordWebhookUrl('https://canary.discord.com/api/webhooks/1/a')).toBe(true);
    expect(isAllowedDiscordWebhookUrl('https://ptb.discord.com/api/webhooks/1/a')).toBe(true);
    expect(isAllowedDiscordWebhookUrl('https://discordapp.com/api/webhooks/1/a')).toBe(true);
    expect(isAllowedDiscordWebhookUrl('http://discord.com/api/webhooks/1/a')).toBe(false);
    expect(isAllowedDiscordWebhookUrl('https://evil.example.com/api/webhooks/1/a')).toBe(false);
    expect(isAllowedDiscordWebhookUrl('not a url')).toBe(false);
  });
});

describe('classifyDiscordFailure', () => {
  it('maps status codes', () => {
    expect(classifyDiscordFailure(429)).toBe('rate_limited');
    expect(classifyDiscordFailure(401)).toBe('channel_config');
    expect(classifyDiscordFailure(403)).toBe('channel_config');
    expect(classifyDiscordFailure(404)).toBe('channel_config');
    expect(classifyDiscordFailure(422)).toBe('invalid_payload');
    expect(classifyDiscordFailure(500)).toBe('transient');
  });
});

describe('discordAdapter', () => {
  it('posts content and returns success on 204', async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe(WEBHOOK_URL);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.content).toContain('https://lightscripts.com/blog/slug');
      return textResponse(null, 204);
    }) as unknown as typeof fetch;

    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result).toEqual({ outcome: 'success' });
  });

  it('treats 200 as success', async () => {
    const fetchImpl = (async () => textResponse('ok', 200)) as unknown as typeof fetch;
    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('success');
  });

  it('maps 404 to channel_config', async () => {
    const fetchImpl = (async () => textResponse('Unknown Webhook', 404)) as unknown as typeof fetch;
    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('channel_config');
  });

  it('maps 401 and 403 to channel_config', async () => {
    const unauthorized = (async () => textResponse('Unauthorized', 401)) as unknown as typeof fetch;
    const forbidden = (async () => textResponse('Forbidden', 403)) as unknown as typeof fetch;

    expect((await discordAdapter.send(request({ fetchImpl: unauthorized }))).outcome).toBe(
      'channel_config',
    );
    expect((await discordAdapter.send(request({ fetchImpl: forbidden }))).outcome).toBe(
      'channel_config',
    );
  });

  it('maps 422 to invalid_payload', async () => {
    const fetchImpl = (async () =>
      textResponse('Invalid Form Body', 422)) as unknown as typeof fetch;
    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('invalid_payload');
  });

  it('maps 429 to rate_limited with Retry-After', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ retry_after: 12 }), {
        status: 429,
        headers: { 'Retry-After': '12' },
      })) as unknown as typeof fetch;

    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result).toMatchObject({
      outcome: 'rate_limited',
      retryAfterMs: 12_000,
      channelLevelRateLimit: true,
    });
  });

  it('caps Retry-After at one hour', async () => {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 429,
        headers: { 'Retry-After': '99999' },
      })) as unknown as typeof fetch;

    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.retryAfterMs).toBe(3_600_000);
  });

  it('maps 5xx to transient', async () => {
    const fetchImpl = (async () => textResponse('Server Error', 500)) as unknown as typeof fetch;
    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
  });

  it('maps a network failure to transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await discordAdapter.send(request({ fetchImpl }));
    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('boom');
  });

  it('rejects a non-Discord host without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return textResponse('', 204);
    }) as unknown as typeof fetch;

    const result = await discordAdapter.send(
      request({ config: { webhookUrl: 'https://evil.example.com/hook' }, fetchImpl }),
    );
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });

  it('returns channel_config when the webhook is missing without fetching', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return textResponse('', 204);
    }) as unknown as typeof fetch;

    const result = await discordAdapter.send(request({ config: {}, fetchImpl }));
    expect(result.outcome).toBe('channel_config');
    expect(called).toBe(false);
  });
});
