import { assertAllowedUrl } from '../security/safe-fetch';
import { extractLinkHrefs, isExternalHref, stripCodeFences } from './audit';

export interface LinkCheckResult {
  url: string;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
}

export interface CheckLinksOptions {
  limit?: number;
  timeoutMs?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_LINK_CHECK_LIMIT = 40;
export const DEFAULT_LINK_CHECK_TIMEOUT_MS = 8000;
export const DEFAULT_LINK_CHECK_CONCURRENCY = 5;

const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}>'"»]+$/;
const MAX_ERROR_LENGTH = 200;

function normalizeExternalHref(href: string, originHost: string | null): string | null {
  const cleaned = href.trim().replace(TRAILING_PUNCTUATION_PATTERN, '');
  const candidate = cleaned.startsWith('//') ? `https:${cleaned}` : cleaned;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (originHost !== null && parsed.host === originHost) {
    return null;
  }

  parsed.hash = '';
  return parsed.href;
}

export function extractExternalLinks(
  bodies: Array<{ id: string; body: string }>,
  origin: string,
): string[] {
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }

  const seen = new Set<string>();

  for (const entry of bodies) {
    for (const href of extractLinkHrefs(stripCodeFences(entry.body ?? ''))) {
      if (!isExternalHref(href)) {
        continue;
      }

      const normalized = normalizeExternalHref(href, originHost);
      if (normalized !== null) {
        seen.add(normalized);
      }
    }
  }

  return [...seen];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'Request timed out.';
    }

    return error.message.slice(0, MAX_ERROR_LENGTH);
  }

  return 'Request failed.';
}

function filterAllowedUrls(urls: string[]): string[] {
  const allowed: string[] = [];

  for (const url of new Set(urls)) {
    try {
      assertAllowedUrl(url);
      allowed.push(url);
    } catch {}
  }

  return allowed;
}

async function requestWithHeadFallback(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  const head = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal });

  if (head.status === 405 || head.status === 501) {
    return fetchImpl(url, { method: 'GET', redirect: 'follow', signal });
  }

  return head;
}

async function checkSingleLink(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<LinkCheckResult> {
  try {
    const response = await requestWithHeadFallback(url, fetchImpl, timeoutMs);
    return { url, statusCode: response.status, ok: response.status < 400, error: null };
  } catch (error) {
    return { url, statusCode: null, ok: false, error: toErrorMessage(error) };
  }
}

export async function checkLinks(
  urls: string[],
  options: CheckLinksOptions = {},
): Promise<LinkCheckResult[]> {
  const limit = Math.max(0, options.limit ?? DEFAULT_LINK_CHECK_LIMIT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_LINK_CHECK_TIMEOUT_MS;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_LINK_CHECK_CONCURRENCY);
  const fetchImpl = options.fetchImpl ?? fetch;

  const targets = filterAllowedUrls(urls).slice(0, limit);
  const results: LinkCheckResult[] = new Array(targets.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await checkSingleLink(targets[index], fetchImpl, timeoutMs);
    }
  }

  const workerCount = Math.min(concurrency, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
