import { describe, expect, it, vi } from 'vitest';
import { checkLinks, extractExternalLinks } from './link-check';

function response(status: number): Response {
  return new Response('', { status });
}

describe('extractExternalLinks', () => {
  it('returns unique absolute external urls in first-seen order', () => {
    const result = extractExternalLinks(
      [
        { id: 'a', body: 'See [x](https://example.com/page) and [local](/blog/y).' },
        { id: 'b', body: '[x](https://example.com/page) [y](https://other.com/z#frag).' },
      ],
      'https://lightscripts.com',
    );

    expect(result).toEqual(['https://example.com/page', 'https://other.com/z']);
  });

  it('drops links to the site origin', () => {
    const result = extractExternalLinks(
      [{ id: 'a', body: '[s](https://lightscripts.com/blog/y) [t](https://external.test/x)' }],
      'https://lightscripts.com',
    );

    expect(result).toEqual(['https://external.test/x']);
  });

  it('strips trailing punctuation from hrefs', () => {
    const result = extractExternalLinks(
      [{ id: 'a', body: '[e](https://example.com/page.)' }],
      'https://lightscripts.com',
    );

    expect(result).toEqual(['https://example.com/page']);
  });

  it('ignores links inside fenced code', () => {
    const result = extractExternalLinks(
      [{ id: 'a', body: '```\n[in](https://incode.test/x)\n```' }],
      'https://lightscripts.com',
    );

    expect(result).toEqual([]);
  });
});

describe('checkLinks', () => {
  it('marks a successful HEAD request as ok', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response(200));

    const results = await checkLinks(['https://example.com/a'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results).toEqual([
      { url: 'https://example.com/a', statusCode: 200, ok: true, error: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('HEAD');
    expect(init?.redirect).toBe('follow');
  });

  it('falls back to GET on a 405 response', async () => {
    const fetchMock = vi
      .fn<(_url: string, _init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));

    const results = await checkLinks(['https://example.com/a'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      statusCode: 200,
      ok: true,
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('GET');
  });

  it('marks a 404 as not ok', async () => {
    const fetchMock = vi.fn(async () => response(404));

    const results = await checkLinks(['https://example.com/missing'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results[0]).toEqual({
      url: 'https://example.com/missing',
      statusCode: 404,
      ok: false,
      error: null,
    });
  });

  it('reports a network error without throwing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('boom');
    });

    const results = await checkLinks(['https://example.com/a'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      statusCode: null,
      ok: false,
      error: 'boom',
    });
  });

  it('caps the number checked by the limit', async () => {
    const fetchMock = vi.fn(async () => response(200));

    const results = await checkLinks(['https://a.test/1', 'https://b.test/2', 'https://c.test/3'], {
      limit: 2,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips urls that fail the https guard', async () => {
    const fetchMock = vi.fn(async () => response(200));

    const results = await checkLinks(['http://insecure.test/x', 'https://ok.test/'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results.map((entry) => entry.url)).toEqual(['https://ok.test/']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated urls', async () => {
    const fetchMock = vi.fn(async () => response(200));

    const results = await checkLinks(['https://a.test/', 'https://a.test/'], {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
  });
});
