export const HOMEPAGE_CACHE_SECONDS = 300;
export const HOMEPAGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${HOMEPAGE_CACHE_SECONDS}, stale-while-revalidate=600`;

interface HomepageCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface CacheStorageLike {
  default?: HomepageCache;
}

function getHomepageCache(): HomepageCache | null {
  try {
    const storage = (globalThis as { caches?: CacheStorageLike }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

export function isCacheableHomepageRequest(request: Request): boolean {
  if (import.meta.env.DEV || request.method !== 'GET') {
    return false;
  }

  return new URL(request.url).pathname === '/';
}

export async function readCachedHomepage(url: string): Promise<Response | null> {
  const cache = getHomepageCache();
  if (!cache) {
    return null;
  }

  try {
    const hit = await cache.match(new Request(url, { method: 'GET' }));
    return hit ?? null;
  } catch {
    return null;
  }
}

export function storeHomepageResponse(
  url: string,
  response: Response,
  waitUntil: (task: Promise<unknown>) => void,
): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', HOMEPAGE_CACHE_CONTROL);

  if (response.status !== 200) {
    return new Response(response.body, { status: response.status, headers });
  }

  const payload = new Response(response.body, { status: response.status, headers });
  const cache = getHomepageCache();

  if (cache) {
    try {
      waitUntil(
        cache.put(new Request(url, { method: 'GET' }), payload.clone()).catch(() => undefined),
      );
    } catch {
      return payload;
    }
  }

  return payload;
}
