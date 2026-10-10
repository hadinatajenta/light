import { toSlug } from '../content/slug';

export const AMAZON_ASIN_PATTERN = /^[A-Za-z0-9]{10}$/;

const AMAZON_URL_ASIN_PATTERNS = [
  /\/dp\/([A-Za-z0-9]{10})(?:[/?]|$)/,
  /\/gp\/product\/([A-Za-z0-9]{10})(?:[/?]|$)/,
  /\/product\/([A-Za-z0-9]{10})(?:[/?]|$)/,
  /[?&]asin=([A-Za-z0-9]{10})(?:&|$)/i,
];

export function isAmazonAsin(value: string): boolean {
  return AMAZON_ASIN_PATTERN.test(value);
}

export function extractAmazonAsin(value: string): string | null {
  if (!value.includes('://')) {
    return null;
  }

  for (const pattern of AMAZON_URL_ASIN_PATTERNS) {
    const match = value.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

export function deriveNameFromAmazonUrl(value: string): string | null {
  if (!value.includes('://')) {
    return null;
  }

  const match =
    value.match(/amazon\.[a-z.]+\/([^/?#]+)\/dp\//i) ??
    value.match(/amazon\.[a-z.]+\/([^/?#]+)\/gp\/product\//i);

  if (!match) {
    return null;
  }

  const name = decodeURIComponent(match[1]).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

  return name.length >= 2 ? name : null;
}

export interface ResolvedTarget {
  target: string;
  name: string | null;
  slug: string | null;
}

export function resolveAffiliateTarget(value: string, isAmazonProgram: boolean): ResolvedTarget {
  const trimmed = value.trim();

  if (!isAmazonProgram || !trimmed.includes('://')) {
    return { target: trimmed, name: null, slug: null };
  }

  const asin = extractAmazonAsin(trimmed);
  if (!asin) {
    return { target: trimmed, name: null, slug: null };
  }

  const derivedName = deriveNameFromAmazonUrl(trimmed);
  const slug = derivedName ? toSlug(derivedName).slice(0, 60).replace(/-+$/, '') : null;

  return { target: asin, name: derivedName, slug: slug && slug.length > 0 ? slug : null };
}
