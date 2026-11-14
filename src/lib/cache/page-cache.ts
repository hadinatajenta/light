export const PUBLIC_PAGE_CACHE_TTL_SECONDS = 300;
export const PAGE_CACHE_STATUS_HEADER = 'X-Page-Cache';

const CACHEABLE_HOSTS = new Set(['lightscripts.com']);
const UNCACHEABLE_PATH_PREFIXES = ['/dashboard', '/api', '/media', '/_astro', '/go'];
const UNCACHEABLE_DIRECTIVE_PATTERN = /\b(private|no-store|no-cache)\b/i;
const STORED_CACHE_CONTROL = `public, max-age=${PUBLIC_PAGE_CACHE_TTL_SECONDS}`;
const CLIENT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

type PageCacheStatus = 'HIT' | 'MISS';

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface PublicPageRequest {
  request: Request;
  url: URL;
  pageCache: Cache | null;
  executionContext: WaitUntilContext | undefined;
  renderPage: () => Promise<Response>;
  onCacheHit: () => Promise<void>;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isCacheablePageRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET' || url.search !== '' || request.headers.has('authorization')) {
    return false;
  }

  if (!CACHEABLE_HOSTS.has(url.hostname)) {
    return false;
  }

  return !UNCACHEABLE_PATH_PREFIXES.some((prefix) => matchesPathPrefix(url.pathname, prefix));
}

export function isCacheablePageResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has('set-cookie')) {
    return false;
  }

  return !UNCACHEABLE_DIRECTIVE_PATTERN.test(response.headers.get('cache-control') ?? '');
}

export function withPageCacheHeaders(
  response: Response,
  cacheControl: string,
  status?: PageCacheStatus,
): Response {
  const decoratedResponse = new Response(response.body, response);
  decoratedResponse.headers.set('Cache-Control', cacheControl);

  if (status) {
    decoratedResponse.headers.set(PAGE_CACHE_STATUS_HEADER, status);
  }

  return decoratedResponse;
}

function isCache(candidate: unknown): candidate is Cache {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'match' in candidate &&
    'put' in candidate
  );
}

export function resolveDefaultPageCache(): Cache | null {
  if (typeof caches === 'undefined' || !('default' in caches)) {
    return null;
  }

  return isCache(caches.default) ? caches.default : null;
}

async function readCachedPage(pageCache: Cache, cacheKey: Request): Promise<Response | null> {
  try {
    return (await pageCache.match(cacheKey)) ?? null;
  } catch (error) {
    console.error('Failed to read a cached page', error);
    return null;
  }
}

async function storeRenderedPage(
  pageCache: Cache,
  cacheKey: Request,
  renderedResponse: Response,
  executionContext: WaitUntilContext | undefined,
): Promise<void> {
  const storing = pageCache
    .put(cacheKey, withPageCacheHeaders(renderedResponse, STORED_CACHE_CONTROL))
    .catch((error: unknown) => {
      console.error('Failed to store a rendered page', error);
    });

  if (executionContext) {
    executionContext.waitUntil(storing);
    return;
  }

  await storing;
}

export async function servePublicPage(options: PublicPageRequest): Promise<Response> {
  const { pageCache } = options;
  if (!pageCache) {
    return options.renderPage();
  }

  const cacheKey = new Request(options.url.toString(), { method: 'GET' });
  const cachedPage = await readCachedPage(pageCache, cacheKey);

  if (cachedPage) {
    await options.onCacheHit();
    return withPageCacheHeaders(cachedPage, CLIENT_CACHE_CONTROL, 'HIT');
  }

  const renderedResponse = await options.renderPage();
  if (!isCacheablePageResponse(renderedResponse)) {
    return renderedResponse;
  }

  await storeRenderedPage(pageCache, cacheKey, renderedResponse.clone(), options.executionContext);
  return withPageCacheHeaders(renderedResponse, CLIENT_CACHE_CONTROL, 'MISS');
}
