import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectGa4, compareGa4ToFirstParty, mapGa4PagePathToPostId } from './ga4';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ga4Row(pagePath: string, sessions: number, screenPageViews: number): unknown {
  return {
    dimensionValues: [{ value: pagePath }],
    metricValues: [{ value: String(sessions) }, { value: String(screenPageViews) }],
  };
}

function readBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mapGa4PagePathToPostId', () => {
  it('maps page paths with query strings and trailing slashes', () => {
    expect(mapGa4PagePathToPostId('/blog/office-chair/')).toBe('office-chair');
    expect(mapGa4PagePathToPostId('/blog/office-chair?utm_source=x')).toBe('office-chair');
    expect(mapGa4PagePathToPostId('blog/office-chair')).toBe('office-chair');
  });

  it('returns null for non article paths', () => {
    expect(mapGa4PagePathToPostId('/')).toBeNull();
    expect(mapGa4PagePathToPostId('/about')).toBeNull();
    expect(mapGa4PagePathToPostId('')).toBeNull();
  });
});

describe('collectGa4', () => {
  it('runs the report with sessions and page views by page path', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ rows: [ga4Row('/blog/desk-lamp/', 12, 30)] }),
    );
    const collection = await collectGa4({
      accessToken: 'token',
      propertyId: '99887766',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      fetchImpl,
    });

    expect(collection.rows).toEqual([
      { pagePath: '/blog/desk-lamp/', postId: 'desk-lamp', sessions: 12, screenPageViews: 30 },
    ]);
    expect(collection.totals).toEqual({ sessions: 12, screenPageViews: 30 });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/99887766:runReport');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(readBody(init)).toMatchObject({
      dateRanges: [{ startDate: '2026-02-15', endDate: '2026-03-14' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
      limit: 1_000,
      offset: 0,
    });
  });

  it('pages until a short batch and stops at the row cap', async () => {
    const batches = [[ga4Row('/blog/a', 1, 1), ga4Row('/blog/b', 1, 1)], [ga4Row('/blog/c', 1, 1)]];
    let call = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: batches[call++] ?? [] }));
    const collection = await collectGa4({
      accessToken: 'token',
      propertyId: '99887766',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
      pageSize: 2,
      fetchImpl,
    });

    expect(collection.rows.map((row) => row.pagePath)).toEqual(['/blog/a', '/blog/b', '/blog/c']);
    expect(collection.truncated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const capped = vi.fn(async () =>
      jsonResponse({ rows: [ga4Row('/blog/a', 1, 1), ga4Row('/blog/b', 1, 1)] }),
    );
    const cappedResult = await collectGa4({
      accessToken: 'token',
      propertyId: '99887766',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
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
      collectGa4({
        accessToken: 'token',
        propertyId: '99887766',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        fetchImpl,
        retry: { attempts: 3, baseDelayMs: 1 },
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_CREDENTIALS_REJECTED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

    const pending = collectGa4({
      accessToken: 'token',
      propertyId: '99887766',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
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

      return calls === 1 ? new Response('{}', { status: 500 }) : jsonResponse({ rows: [] });
    });

    await expect(
      collectGa4({
        accessToken: 'token',
        propertyId: '99887766',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
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
      collectGa4({
        accessToken: 'token',
        propertyId: '99887766',
        startDate: '2026-02-15',
        endDate: '2026-03-14',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_TIMEOUT', status: 504 });
  });
});

describe('compareGa4ToFirstParty', () => {
  it('flags a difference of more than five times in either direction', () => {
    const rows = [
      { pagePath: '/blog/high/', postId: 'high', sessions: 1, screenPageViews: 60 },
      { pagePath: '/blog/low/', postId: 'low', sessions: 1, screenPageViews: 1 },
      { pagePath: '/blog/close/', postId: 'close', sessions: 1, screenPageViews: 50 },
      { pagePath: '/about', postId: null, sessions: 1, screenPageViews: 900 },
    ];
    const crossCheck = compareGa4ToFirstParty(
      rows,
      new Map([
        ['high', 10],
        ['low', 20],
        ['close', 10],
      ]),
    );

    expect(crossCheck.compared).toBe(3);
    expect(crossCheck.mismatches.map((mismatch) => mismatch.postId)).toEqual(['low', 'high']);
    expect(crossCheck.mismatches[0]).toMatchObject({
      postId: 'low',
      ga4Views: 1,
      firstPartyViews: 20,
      ratio: 20,
    });
    expect(crossCheck.mismatches[1]).toMatchObject({
      postId: 'high',
      ga4Views: 60,
      firstPartyViews: 10,
      ratio: 6,
    });
  });

  it('treats equal views and a missing first party row as comparable', () => {
    const crossCheck = compareGa4ToFirstParty(
      [
        { pagePath: '/blog/a', postId: 'a', sessions: 1, screenPageViews: 4 },
        { pagePath: '/blog/b', postId: 'b', sessions: 1, screenPageViews: 0 },
      ],
      new Map([['a', 4]]),
    );

    expect(crossCheck.mismatches).toEqual([]);
  });
});
