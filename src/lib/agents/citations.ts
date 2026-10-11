const MIN_QUOTE_LENGTH = 32;
const MIN_QUOTE_TOKENS = 6;
const TOKEN_OVERLAP_THRESHOLD = 0.85;
const MIN_TOKEN_LENGTH = 3;

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'ref',
  'ref_src',
  'mc_cid',
  'mc_eid',
];

export function normalizeUrlKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }

    let value = parsed.toString();
    if (value.endsWith('/')) {
      value = value.slice(0, -1);
    }

    return value;
  } catch {
    return rawUrl.trim();
  }
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_#>|~^]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return value.split(' ').filter((token) => token.length > MIN_TOKEN_LENGTH);
}

function hasTokenOverlap(normalizedQuote: string, normalizedSource: string): boolean {
  const quoteTokens = tokenize(normalizedQuote);
  if (quoteTokens.length < MIN_QUOTE_TOKENS) {
    return false;
  }

  const sourceTokens = new Set(tokenize(normalizedSource));
  let matched = 0;
  for (const token of quoteTokens) {
    if (sourceTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / quoteTokens.length >= TOKEN_OVERLAP_THRESHOLD;
}

export function verifyQuote(quote: string, sourceText: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < MIN_QUOTE_LENGTH) {
    return false;
  }

  const normalizedSource = normalizeForMatch(sourceText);
  if (normalizedSource.includes(normalizedQuote)) {
    return true;
  }

  return hasTokenOverlap(normalizedQuote, normalizedSource);
}

export function resolveSourceUrl(candidate: string, allowed: Map<string, string>): string | null {
  if (!candidate) {
    return null;
  }

  return allowed.get(normalizeUrlKey(candidate)) ?? null;
}

export function dedupeByUrlKey<T extends { url: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const entry of entries) {
    const key = normalizeUrlKey(entry.url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }

  return result;
}
