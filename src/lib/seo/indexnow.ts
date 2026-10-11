const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const DEFAULT_SITE_ORIGIN = 'https://lightscripts.com';

const DEFAULT_TIMEOUT_MS = 5000;
const KEY_LOCATION_PATH = '/indexnow.txt';

export interface IndexNowOptions {
  origin?: string;
  key?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function buildIndexNowPayload(
  host: string,
  key: string,
  keyLocation: string,
  urls: string[],
): string {
  return JSON.stringify({ host, key, keyLocation, urlList: urls });
}

export function toIndexNowUrl(origin: string, path: string): string {
  const base = origin.endsWith('/') ? origin : `${origin}/`;
  const relative = path.startsWith('/') ? path.slice(1) : path;
  return new URL(relative, base).href;
}

async function readIndexNowKey(): Promise<string | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { INDEXNOW_KEY?: string }).INDEXNOW_KEY ?? null;
  } catch {
    return null;
  }
}

function toPublicUrls(origin: string, paths: string[]): string[] {
  const host = new URL(origin).host;
  const urls: string[] = [];

  for (const path of paths) {
    const url = new URL(toIndexNowUrl(origin, path));
    if (url.protocol === 'https:' && url.host === host) {
      urls.push(url.href);
    }
  }

  return urls;
}

export async function notifyIndexNow(
  paths: string[],
  options: IndexNowOptions = {},
): Promise<boolean> {
  const key = options.key ?? (await readIndexNowKey());
  if (!key) {
    return false;
  }

  const origin = options.origin ?? DEFAULT_SITE_ORIGIN;

  let host: string;
  let keyLocation: string;
  let urls: string[];

  try {
    host = new URL(origin).host;
    keyLocation = toIndexNowUrl(origin, KEY_LOCATION_PATH);
    urls = toPublicUrls(origin, paths);
  } catch (error) {
    console.error('IndexNow notification failed', error);
    return false;
  }

  if (urls.length === 0) {
    return false;
  }

  const body = buildIndexNowPayload(host, key, keyLocation, urls);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    return response.ok;
  } catch (error) {
    console.error('IndexNow notification failed', error);
    return false;
  }
}
