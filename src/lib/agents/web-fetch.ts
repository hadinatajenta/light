import { ApiError } from '../errors';
import { extractHtmlTitle, htmlToText } from '../net/html-text';
import { assertAllowedUrl, readCappedBytes } from '../security/safe-fetch';

const MAX_BYTES = 1_500_000;
const MAX_CHARS = 8_000;
const TIMEOUT_MS = 12_000;
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/xml',
  'text/xml',
];
const USER_AGENT = 'LightScrapper/1.0 (+https://lightscripts.com)';

const URL_GUARD = {
  allowedProtocols: ALLOWED_PROTOCOLS,
  rejectCode: 'SOURCE_URL_REJECTED',
  label: 'source',
};

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

function linkSignals(
  signals: Array<AbortSignal | undefined>,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const listeners: Array<{ signal: AbortSignal; handler: () => void }> = [];

  for (const signal of signals) {
    if (!signal) {
      continue;
    }
    if (signal.aborted) {
      controller.abort();
      continue;
    }
    const handler = (): void => controller.abort();
    signal.addEventListener('abort', handler, { once: true });
    listeners.push({ signal, handler });
  }

  const cancel = (): void => {
    clearTimeout(timeoutId);
    for (const { signal, handler } of listeners) {
      signal.removeEventListener('abort', handler);
    }
  };

  return { signal: controller.signal, cancel };
}

export async function fetchPage(
  url: string,
  options: { signal?: AbortSignal; maxChars?: number } = {},
): Promise<FetchedPage> {
  const initial = assertAllowedUrl(url, URL_GUARD);
  const { signal, cancel } = linkSignals([options.signal], TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(initial, {
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
        },
        signal,
      });
    } catch {
      throw new ApiError(502, 'SOURCE_FETCH_FAILED', 'The source page could not be fetched.');
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        'SOURCE_FETCH_FAILED',
        `The source page responded with status ${response.status}.`,
      );
    }

    assertAllowedUrl(response.url, URL_GUARD);

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType && !ALLOWED_CONTENT_TYPES.some((type) => contentType.includes(type))) {
      throw new ApiError(422, 'SOURCE_CONTENT_REJECTED', 'The source is not a readable web page.');
    }

    const bytes = await readCappedBytes(response, MAX_BYTES);
    if (!bytes) {
      throw new ApiError(413, 'SOURCE_TOO_LARGE', 'The source page is too large to read.');
    }

    const html = new TextDecoder('utf-8').decode(bytes);
    const text = htmlToText(html).slice(0, options.maxChars ?? MAX_CHARS);

    return {
      url: response.url || initial.toString(),
      title: extractHtmlTitle(html) || initial.hostname,
      text,
    };
  } finally {
    cancel();
  }
}
