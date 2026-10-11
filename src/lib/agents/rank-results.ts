import { tokenizeForMatching } from './catalog';
import type { SearchResult } from './search/types';

const AUTHORITY_HOST_SUFFIXES = [
  '.gov',
  '.edu',
  '.gov.uk',
  '.ac.uk',
  '.europa.eu',
  '.who.int',
  '.iso.org',
  '.ieee.org',
  '.ansi.org',
  '.nist.gov',
];

const AUTHORITY_HOSTS = [
  'ansi.org',
  'iso.org',
  'ieee.org',
  'osha.gov',
  'nist.gov',
  'cdc.gov',
  'who.int',
  'energystar.gov',
  'europa.eu',
];

const LOW_QUALITY_HOSTS = [
  'amazon.',
  'pinterest.',
  'quora.',
  'slideshare.',
  'aliexpress.',
  'temu.',
  'youtube.',
  'tiktok.',
  'bestreviews.',
  'toptenreviews.',
  'top10reviews.',
  'consumerreview.',
  'consumersearch.',
  'consumerguide.',
  'ebay.',
  'walmart.',
  'etsy.',
  'target.',
  'bestbuy.',
  'lowes.',
  'homedepot.',
  'costco.',
  'wayfair.',
  'samsclub.',
  'alibaba.',
];

const COMMERCE_INTENT_PATTERNS = [
  '/deals',
  '/coupon',
  '/shop',
  '/buy',
  '/collections',
  'best-',
  'best ',
  'top-10',
  'top 10',
  'topten',
  'buying-guide',
  'buying guide',
  'affiliate',
  'discount',
  'coupon',
  'sale',
  'promo',
];

const LOW_QUALITY_HOST_PENALTY = 5;
const COMMERCE_INTENT_PENALTY = 2;
const AUTHORITY_BONUS = 5;
const TOPIC_TOKEN_BONUS = 1;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

interface TopicHint {
  title: string;
  keywords: string[];
}

function hasCommerceIntent(result: SearchResult): boolean {
  const haystack = `${pathOf(result.url)} ${result.title.toLowerCase()}`;
  return COMMERCE_INTENT_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function scoreResult(result: SearchResult, tokens: Set<string>): number {
  const host = hostOf(result.url);
  let score = 0;

  if (LOW_QUALITY_HOSTS.some((entry) => host.includes(entry))) {
    score -= LOW_QUALITY_HOST_PENALTY;
  }

  if (hasCommerceIntent(result)) {
    score -= COMMERCE_INTENT_PENALTY;
  }

  if (
    AUTHORITY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    AUTHORITY_HOSTS.includes(host)
  ) {
    score += AUTHORITY_BONUS;
  }

  const haystack = `${result.title} ${result.snippet}`.toLowerCase();
  for (const token of tokens) {
    if (token.length > 3 && haystack.includes(token)) {
      score += TOPIC_TOKEN_BONUS;
    }
  }

  return score;
}

export function rankSearchResults<T extends SearchResult>(
  results: T[],
  topic: TopicHint,
  limit: number,
): T[] {
  const tokens = new Set(tokenizeForMatching([topic.title, ...topic.keywords].join(' ')));

  return [...results]
    .map((result) => ({ result, score: scoreResult(result, tokens) }))
    .sort((first, second) => second.score - first.score)
    .slice(0, Math.max(limit, 0))
    .map((entry) => entry.result);
}
