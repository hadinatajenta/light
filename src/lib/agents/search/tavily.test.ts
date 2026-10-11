import { afterEach, describe, expect, it, vi } from 'vitest';
import { tavilyProvider } from './tavily';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tavilyProvider', () => {
  it('maps provider results into search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [{ title: 'Office chairs', url: 'https://example.com', content: 'snippet' }],
        }),
      ),
    );

    await expect(tavilyProvider.search({ query: 'q', limit: 3, apiKey: 'k' })).resolves.toEqual([
      { title: 'Office chairs', url: 'https://example.com', snippet: 'snippet' },
    ]);
  });

  it('sends the bearer token, query, and result limit', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ results: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await tavilyProvider.search({ query: 'office chair', limit: 5, apiKey: 'tvly-x' });

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(headers.Authorization).toBe('Bearer tvly-x');
    expect(body.query).toBe('office chair');
    expect(body.max_results).toBe(5);
  });

  it('drops results without a url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [{ title: 'no url' }, { url: 'https://a.com' }] })),
    );

    const results = await tavilyProvider.search({ query: 'q', limit: 3, apiKey: 'k' });
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe('https://a.com');
  });

  it('maps a 401 to an unauthorized error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 401)),
    );

    await expect(
      tavilyProvider.search({ query: 'q', limit: 1, apiKey: 'k' }),
    ).rejects.toMatchObject({ code: 'SEARCH_UNAUTHORIZED' });
  });

  it('maps a 429 to a rate limited error with retry-after', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '30' } })),
    );

    await expect(
      tavilyProvider.search({ query: 'q', limit: 1, apiKey: 'k' }),
    ).rejects.toMatchObject({ code: 'SEARCH_RATE_LIMITED', details: { retryAfter: '30' } });
  });

  it('fails fast when the key is missing', async () => {
    await expect(
      tavilyProvider.search({ query: 'q', limit: 1, apiKey: null }),
    ).rejects.toMatchObject({ code: 'SEARCH_KEY_MISSING' });
  });
});
