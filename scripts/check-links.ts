import process from 'node:process';

const DEFAULT_SITE_URL = 'https://lightscripts.com';
const SITEMAP_PATH = '/sitemap.xml';
const MAX_SITEMAP_URLS = 200;
const MAX_INTERNAL_LINKS = 300;
const REQUEST_TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;
const USER_AGENT = 'light-link-check';
const SKIPPED_PROTOCOLS = ['mailto:', 'tel:', 'javascript:', 'data:'];
const HTML_CONTENT_TYPE = /text\/html|application\/xhtml\+xml/i;
const NON_HTML_EXTENSION =
  /\.(?:avif|bmp|csv|css|docx?|eot|gif|gz|ico|jpe?g|js|json|mjs|mov|mp3|mp4|otf|pdf|png|pptx?|rar|rss|svg|tar|tgz|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i;
const HREF_PATTERN = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const LOC_PATTERN = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

interface LinkFailure {
  url: string;
  reason: string;
}

interface PageResponse {
  status: number;
  contentType: string;
  body: string | null;
}

function normalizeSiteUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isHtmlContentType(contentType: string): boolean {
  return HTML_CONTENT_TYPE.test(contentType);
}

function isSkippedHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return SKIPPED_PROTOCOLS.some((protocol) => lower.startsWith(protocol));
}

function hasNonHtmlExtension(url: URL): boolean {
  const segments = url.pathname.split('/');
  const lastSegment = segments[segments.length - 1] ?? '';

  return lastSegment.includes('.') && NON_HTML_EXTENSION.test(lastSegment);
}

function toInternalLink(href: string, pageUrl: string, siteOrigin: string): string | null {
  if (isSkippedHref(href)) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(href.trim(), pageUrl);
  } catch {
    return null;
  }

  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }

  if (resolved.origin !== siteOrigin || hasNonHtmlExtension(resolved)) {
    return null;
  }

  resolved.hash = '';
  return resolved.toString();
}

function extractInternalLinks(html: string, pageUrl: string, siteOrigin: string): string[] {
  const links = new Set<string>();

  for (const match of html.matchAll(HREF_PATTERN)) {
    const link = toInternalLink(match[1] ?? match[2] ?? '', pageUrl, siteOrigin);
    if (link) {
      links.add(link);
    }
  }

  return [...links];
}

function extractSitemapUrls(body: string): string[] {
  const urls: string[] = [];

  for (const match of body.matchAll(LOC_PATTERN)) {
    const value = match[1];
    if (value.startsWith('http://') || value.startsWith('https://')) {
      urls.push(value);
    }
  }

  return [...new Set(urls)];
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<PageResponse> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      });

      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        body: response.status === 200 ? await response.text() : null,
      };
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return { status: 0, contentType: '', body: null };
}

async function runPool<T>(
  entries: string[],
  worker: (entry: string) => Promise<T>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(entries.length);
  let cursor = 0;

  const run = async (): Promise<void> => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(entries[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => run()));

  return results;
}

function failureReason(page: PageResponse): string {
  return page.status === 0 ? 'no response' : `HTTP ${page.status}`;
}

async function checkLinks(): Promise<void> {
  const siteUrl = normalizeSiteUrl(process.env.SITE_URL ?? DEFAULT_SITE_URL);
  const failures: LinkFailure[] = [];

  const sitemap = await fetchPage(`${siteUrl}${SITEMAP_PATH}`);
  const sitemapUrls =
    sitemap.status === 200 && sitemap.body !== null
      ? extractSitemapUrls(sitemap.body).slice(0, MAX_SITEMAP_URLS)
      : [];

  if (sitemapUrls.length === 0) {
    console.error(`No URLs found in ${siteUrl}${SITEMAP_PATH} (${failureReason(sitemap)}).`);
    process.exit(1);
  }

  const pageResults = await runPool(
    sitemapUrls,
    async (url) => ({ url, page: await fetchPage(url) }),
    CONCURRENCY,
  );

  for (const { url, page } of pageResults) {
    if (page.status !== 200) {
      failures.push({ url, reason: failureReason(page) });
    }
  }

  const internalLinks = [
    ...new Set(
      pageResults.flatMap(({ url, page }) =>
        page.status === 200 && page.body !== null && isHtmlContentType(page.contentType)
          ? extractInternalLinks(page.body, url, siteUrl)
          : [],
      ),
    ),
  ].slice(0, MAX_INTERNAL_LINKS);

  const internalResults = await runPool(
    internalLinks,
    async (url) => ({ url, page: await fetchPage(url) }),
    CONCURRENCY,
  );

  for (const { url, page } of internalResults) {
    if (page.status !== 200) {
      failures.push({ url, reason: failureReason(page) });
    }
  }

  console.log(`Site: ${siteUrl}`);
  console.log(
    `Checked ${sitemapUrls.length} sitemap URL(s) and ${internalLinks.length} internal link(s).`,
  );

  if (failures.length === 0) {
    console.log('All checked links returned 200.');
    process.exit(0);
  }

  console.error(`Found ${failures.length} failing link(s):`);
  for (const failure of failures) {
    console.error(`- ${failure.url}: ${failure.reason}`);
  }
  process.exit(1);
}

try {
  await checkLinks();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
