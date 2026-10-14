import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSearchConsole, mapGscPageUrlToPostId, querySearchAnalytics } from './gsc';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function gscRow(keys: string[], clicks: number, impressions: number, position: number): unknown {
  return { keys, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position };
}

function readBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mapGscPageUrlToPostId', () => {
  it('maps full urls with any host, query, and trailing slash', () => {
    expect(mapGscPageUrlToPostId('https://www.lightscripts.com/blog/office-chair/?utm=1')).toBe(
      'office-chair',
    );
    expect(mapGscPageUrlToPostId('https://lightscripts.com/blog/desk-lamp/')).toBe('desk-lamp');
    expect(mapGscPageUrlToPostId('http://lightscripts.com/blog/desk-lamp#top')).toBe('desk-lamp');
    expect(mapGscPageUrlToPostId('lightscripts.com/blog/desk-lamp')).toBe('desk-lamp');
    expect(mapGscPageUrlToPostId('/blog/desk-lamp')).toBe('desk-lamp');
  });

  it('returns null for pages that are not posts', () => {
    expect(mapGscPageUrlToPostId('https://example.com/')).toBeNull();
    expect(mapGscPageUrlToPostId('https://www.lightscripts.com/')).toBeNull();
    expect(mapGscPageUrlToPostId('https://www.lightscripts.com/about')).toBeNull();
    expect(mapGscPageUrlToPostId('https://www.lightscripts.com/blog/')).toBeNull();
    expect(mapGscPageUrlToPostId('')).toBeNull();
    expect(mapGscPageUrlToPostId('   ')).toBeNull();
  });
});

describe('querySearchAnalytics', () => {
  it('posts the request with the bearer token and parses rows', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ rows: [gscRow(['https://lightscripts.com/blog/desk-lamp/'], 3, 120, 4.5)] }),
    );
    const result = await querySearchAnalytics({
      accessToken: 'token',
      property: 'sc-domain:lightscripts.com',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      dimensions: ['page'],
      fetchImpl,
    });

    expect(result.rows).toEqual([
      {
        keys: ['https://lightscripts.com/blog/desk-lamp/'],
        clicks: 3,
        impressions: 120,
        position: 4.5,
      },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toContain(encodeURIComponent('sc-domain:lightscripts.com'));
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(readBody(init)).toMatchObject({
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      dimensions: ['page'],
      rowLimit: 5_000,
      startRow: 0,
    });
  });

  it('pages until a short batch and stops at the row cap', async () => {
    const pages = [
      [gscRow(['/blog/a'], 0, 10, 1), gscRow(['/blog/b'], 0, 10, 1)],
      [gscRow(['/blog/c'], 0, 10, 1), gscRow(['/blog/d'], 0, 10, 1)],
      [],
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: pages[call++] ?? [] }));
    const result = await querySearchAnalytics({
      accessToken: 'token',
      property: 'https://lightscripts.com/',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      dimensions: ['page'],
      pageSize: 2,
      maxRows: 10,
      fetchImpl,
    });

    expect(result.rows).toHaveLength(4);
    expect(result.truncated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const capped = vi.fn(async () =>
      jsonResponse({ rows: [gscRow(['/blog/a'], 0, 10, 1), gscRow(['/blog/b'], 0, 10, 1)] }),
    );
    const cappedResult = await querySearchAnalytics({
      accessToken: 'token',
      property: 'https://lightscripts.com/',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      dimensions: ['page'],
      pageSize: 2,
      maxRows: 2,
      fetchImpl: capped,
    });

    expect(cappedResult.rows).toHaveLength(2);
    expect(cappedResult.truncated).toBe(true);
    expect(capped).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 to a credential rejection without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));

    await expect(
      querySearchAnalytics({
        accessToken: 'token',
        property: 'https://lightscripts.com/',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        dimensions: ['page'],
        fetchImpl,
        retry: { attempts: 3, baseDelayMs: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIALS_REJECTED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a 404 to a property not found error', async () => {
    const fetchImpl = async () => new Response('{}', { status: 404 });

    await expect(
      querySearchAnalytics({
        accessToken: 'token',
        property: 'https://lightscripts.com/',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        dimensions: ['page'],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_PROPERTY_NOT_FOUND' });
  });

  it('honours retry-after before the second attempt', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;

      return calls === 1
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '1' } })
        : jsonResponse({ rows: [] });
    });

    const pending = querySearchAnalytics({
      accessToken: 'token',
      property: 'https://lightscripts.com/',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      dimensions: ['page'],
      fetchImpl,
      retry: { attempts: 2, baseDelayMs: 1 },
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ rowCount: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx and then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;

      return calls === 1 ? new Response('{}', { status: 503 }) : jsonResponse({ rows: [] });
    });

    await expect(
      querySearchAnalytics({
        accessToken: 'token',
        property: 'https://lightscripts.com/',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        dimensions: ['page'],
        fetchImpl,
        retry: { attempts: 2, baseDelayMs: 1 },
      }),
    ).resolves.toMatchObject({ rowCount: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps an aborted request to a timeout', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };

    await expect(
      querySearchAnalytics({
        accessToken: 'token',
        property: 'https://lightscripts.com/',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        dimensions: ['page'],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_TIMEOUT', status: 504 });
  });
});

describe('collectSearchConsole', () => {
  it('runs the three dimensions and maps unmapped pages and truncation', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const dimensions = readBody(init).dimensions as string[];

      if (dimensions.length === 1 && dimensions[0] === 'page') {
        return jsonResponse({
          rows: [
            gscRow(['https://www.lightscripts.com/blog/desk-lamp/', 'ignored'], 3, 120, 4.5),
            gscRow(['https://www.lightscripts.com/about'], 1, 30, 8),
          ],
        });
      }

      if (dimensions.length === 1 && dimensions[0] === 'query') {
        return jsonResponse({
          rows: [gscRow(['standing desk cable tray'], 2, 80, 12)],
        });
      }

      return jsonResponse({
        rows: [
          gscRow(['https://www.lightscripts.com/blog/desk-lamp/', 'desk lamp angle'], 1, 40, 6),
          gscRow(['https://www.lightscripts.com/about', 'standing desk cable tray'], 1, 20, 9),
        ],
      });
    });

    const collection = await collectSearchConsole({
      accessToken: 'token',
      property: 'https://lightscripts.com/',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(collection.pages).toEqual([
      {
        pageUrl: 'https://www.lightscripts.com/blog/desk-lamp/',
        postId: 'desk-lamp',
        impressions: 120,
        clicks: 3,
        positionSum: 540,
      },
      {
        pageUrl: 'https://www.lightscripts.com/about',
        postId: null,
        impressions: 30,
        clicks: 1,
        positionSum: 240,
      },
    ]);
    expect(collection.queries).toEqual([
      { query: 'standing desk cable tray', impressions: 80, clicks: 2, positionSum: 960 },
    ]);
    expect(collection.unmappedPages).toEqual(['https://www.lightscripts.com/about']);
    expect(
      collection.pageQueries.filter((row) => row.postId !== null).map((row) => row.query),
    ).toEqual(['desk lamp angle']);
  });
});
