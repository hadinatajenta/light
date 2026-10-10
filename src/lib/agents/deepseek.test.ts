import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatCompletion, extractJsonObject } from './deepseek';

const BASE_REQUEST = {
  apiKey: 'sk-test',
  model: 'deepseek-flash',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractJsonObject', () => {
  it('parses a plain object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses an object surrounded by prose', () => {
    expect(extractJsonObject('Here you go:\n{"title":"x"}\nThanks')).toEqual({ title: 'x' });
  });

  it('throws when no object is present', () => {
    expect(() => extractJsonObject('no json here')).toThrowError(/JSON object/);
  });

  it('throws on malformed json', () => {
    expect(() => extractJsonObject('{oops}')).toThrowError(/invalid JSON/);
  });
});

describe('createChatCompletion', () => {
  it('returns content, reasoning, and token usage', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'answer', reasoning_content: 'thinking' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatCompletion(BASE_REQUEST);

    expect(result).toEqual({
      content: 'answer',
      reasoning: 'thinking',
      tokensIn: 12,
      tokensOut: 7,
    });
  });

  it('sends thinking mode, user id, and json mode in the body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '{}' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createChatCompletion({
      ...BASE_REQUEST,
      userId: 'agent-1',
      jsonMode: true,
      effort: 'low',
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.user_id).toBe('agent-1');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.reasoning_effort).toBe('low');
  });

  it('tolerates keep-alive blank lines before the json body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(`\n\n${JSON.stringify({ choices: [{ message: { content: 'ok' } }] })}`),
      ),
    );

    await expect(createChatCompletion(BASE_REQUEST)).resolves.toMatchObject({ content: 'ok' });
  });

  it('maps a rejected key to an unauthorized error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'bad key' }, 401)),
    );
    await expect(createChatCompletion(BASE_REQUEST)).rejects.toMatchObject({
      code: 'DEEPSEEK_UNAUTHORIZED',
    });
  });

  it('maps a 429 to a rate limited error with retry-after', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );

    await expect(createChatCompletion(BASE_REQUEST)).rejects.toMatchObject({
      code: 'DEEPSEEK_RATE_LIMITED',
      details: { retryAfter: '30' },
    });
  });

  it('maps a network failure to an unreachable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    await expect(createChatCompletion(BASE_REQUEST)).rejects.toMatchObject({
      code: 'DEEPSEEK_UNREACHABLE',
    });
  });
});
