import { describe, expect, it, vi } from 'vitest';
import {
  isCacheablePageRequest,
  isCacheablePageResponse,
  PAGE_CACHE_STATUS_HEADER,
  PUBLIC_PAGE_CACHE_TTL_SECONDS,
  type PublicPageRequest,
  servePublicPage,
} from './page-cache';

const POST_URL = 'https://lightscripts.com/blog/gemini-4-hydrogen-explained/';

function createFakeCache(): {
  pageCache: Cache;
  storedPages: Map<string, Response>;
} {
  const storedPages = new Map<string, Response>();

  const pageCache = {
    async match(request: Request) {
      return storedPages.get(request.url)?.clone();
    },
    async put(request: Request, response: Response) {
      storedPages.set(request.url, response);
    },
  } as unknown as Cache;

  return { pageCache, storedPages };
}

function createPageRequest(overrides: Partial<PublicPageRequest>): PublicPageRequest {
  return {
    request: new Request(POST_URL),
    url: new URL(POST_URL),
    pageCache: null,
    executionContext: undefined,
    renderPage: async () =>
      new Response('<html>post</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    onCacheHit: async () => undefined,
    ...overrides,
  };
}

describe('isCacheablePageRequest', () => {
  it('accepts an anonymous GET for a public page on the canonical host', () => {
    expect(isCacheablePageRequest(new Request(POST_URL), new URL(POST_URL))).toBe(true);
  });

  it.each([
    ['a POST request', new Request(POST_URL, { method: 'POST' }), POST_URL],
    ['a query string', new Request(`${POST_URL}?ref=feed`), `${POST_URL}?ref=feed`],
    [
      'the admin host',
      new Request('https://admin.lightscripts.com/'),
      'https://admin.lightscripts.com/',
    ],
    [
      'a dashboard path',
      new Request('https://lightscripts.com/dashboard'),
      'https://lightscripts.com/dashboard',
    ],
    [
      'an API path',
      new Request('https://lightscripts.com/api/posts'),
      'https://lightscripts.com/api/posts',
    ],
    [
      'a media path',
      new Request('https://lightscripts.com/media/a.jpg'),
      'https://lightscripts.com/media/a.jpg',
    ],
    [
      'an authorization header',
      new Request(POST_URL, { headers: { Authorization: 'Bearer token' } }),
      POST_URL,
    ],
  ])('rejects %s', (_label, request, url) => {
    expect(isCacheablePageRequest(request, new URL(url))).toBe(false);
  });
});

describe('isCacheablePageResponse', () => {
  it('accepts a plain 200 response', () => {
    expect(isCacheablePageResponse(new Response('ok'))).toBe(true);
  });

  it.each([
    ['a 404 response', new Response('missing', { status: 404 })],
    ['a redirect', new Response(null, { status: 301, headers: { Location: '/' } })],
    ['a response that sets a cookie', new Response('ok', { headers: { 'Set-Cookie': 'id=1' } })],
    ['a private response', new Response('ok', { headers: { 'Cache-Control': 'private' } })],
    ['a no-store response', new Response('ok', { headers: { 'Cache-Control': 'no-store' } })],
  ])('rejects %s', (_label, response) => {
    expect(isCacheablePageResponse(response)).toBe(false);
  });
});

describe('servePublicPage', () => {
  it('renders, stores the page with the shared TTL, and reports a miss', async () => {
    const { pageCache, storedPages } = createFakeCache();
    const renderPage = vi.fn(createPageRequest({}).renderPage);

    const response = await servePublicPage(createPageRequest({ pageCache, renderPage }));

    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(response.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('MISS');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.text()).toBe('<html>post</html>');
    expect(storedPages.get(POST_URL)?.headers.get('Cache-Control')).toBe(
      `public, max-age=${PUBLIC_PAGE_CACHE_TTL_SECONDS}`,
    );
  });

  it('serves a stored page without rendering and runs the hit callback', async () => {
    const { pageCache, storedPages } = createFakeCache();
    storedPages.set(POST_URL, new Response('<html>cached</html>', { status: 200 }));
    const renderPage = vi.fn(createPageRequest({}).renderPage);
    const onCacheHit = vi.fn(async () => undefined);

    const response = await servePublicPage(
      createPageRequest({ pageCache, renderPage, onCacheHit }),
    );

    expect(renderPage).not.toHaveBeenCalled();
    expect(onCacheHit).toHaveBeenCalledTimes(1);
    expect(response.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('HIT');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.text()).toBe('<html>cached</html>');
  });

  it('does not store a response that is not cacheable', async () => {
    const { pageCache, storedPages } = createFakeCache();

    const response = await servePublicPage(
      createPageRequest({
        pageCache,
        renderPage: async () => new Response('Not Found', { status: 404 }),
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.has(PAGE_CACHE_STATUS_HEADER)).toBe(false);
    expect(storedPages.size).toBe(0);
  });

  it('renders the page when the cache read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingCache = {
      match: async () => {
        throw new Error('cache unavailable');
      },
      put: async () => undefined,
    } as unknown as Cache;

    const response = await servePublicPage(createPageRequest({ pageCache: failingCache }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>post</html>');
    expect(consoleError).toHaveBeenCalledWith('Failed to read a cached page', expect.any(Error));
    consoleError.mockRestore();
  });

  it('defers the cache write to waitUntil when an execution context exists', async () => {
    const { pageCache, storedPages } = createFakeCache();
    const pendingWrites: Promise<unknown>[] = [];
    const executionContext = {
      waitUntil: (promise: Promise<unknown>) => pendingWrites.push(promise),
    };

    await servePublicPage(createPageRequest({ pageCache, executionContext }));

    expect(pendingWrites).toHaveLength(1);
    await Promise.all(pendingWrites);
    expect(storedPages.has(POST_URL)).toBe(true);
  });

  it('renders directly when no cache is available', async () => {
    const response = await servePublicPage(createPageRequest({ pageCache: null }));

    expect(response.headers.has(PAGE_CACHE_STATUS_HEADER)).toBe(false);
    expect(await response.text()).toBe('<html>post</html>');
  });
});
