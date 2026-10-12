import { describe, expect, it } from 'vitest';
import { buildTelegramNotificationEndpoint, sendNotificationTelegram } from './telegram';

const CONFIG = { botToken: '123456:ABC-DEF', chatId: '987654' };

function buildFetch(response: Response): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response;
  }) as typeof fetch;

  return { fetchImpl, calls };
}

describe('buildTelegramNotificationEndpoint', () => {
  it('targets sendMessage for the bot', () => {
    expect(buildTelegramNotificationEndpoint('token-1')).toBe(
      'https://api.telegram.org/bottoken-1/sendMessage',
    );
  });
});

describe('sendNotificationTelegram', () => {
  it('returns the message id on success', async () => {
    const { fetchImpl } = buildFetch(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result).toEqual({ outcome: 'success', providerId: '42' });
  });

  it('sends plain text so model output cannot inject markup', async () => {
    const { fetchImpl, calls } = buildFetch(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await sendNotificationTelegram(CONFIG, '<b>bold</b>', { fetchImpl });

    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;

    expect(body.text).toBe('<b>bold</b>');
    expect(body.parse_mode).toBeUndefined();
    expect(body.chat_id).toBe('987654');
  });

  it('treats a missing chat as a configuration problem', async () => {
    const { fetchImpl } = buildFetch(
      new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), {
        status: 400,
      }),
    );

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result.outcome).toBe('channel_config');
    expect(result.error).toContain('chat not found');
  });

  it('treats a rejected token as a configuration problem', async () => {
    const { fetchImpl } = buildFetch(
      new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 }),
    );

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result.outcome).toBe('channel_config');
  });

  it('treats throttling as rate limited', async () => {
    const { fetchImpl } = buildFetch(
      new Response(JSON.stringify({ ok: false, description: 'Too Many Requests' }), {
        status: 429,
      }),
    );

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result.outcome).toBe('rate_limited');
  });

  it('treats a transport failure as transient', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('network down');
  });

  it('falls back to the raw body when the response is not JSON', async () => {
    const { fetchImpl } = buildFetch(new Response('<html>gateway</html>', { status: 502 }));

    const result = await sendNotificationTelegram(CONFIG, 'hello', { fetchImpl });

    expect(result.outcome).toBe('transient');
    expect(result.error).toContain('gateway');
  });
});
