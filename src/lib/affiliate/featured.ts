import { rankCatalogForTopic } from '../agents/catalog';
import type { AffiliateProduct } from './store';

export const FEATURED_PRODUCT_LIMIT = 4;
export const FEATURED_NOTE_MAX_LENGTH = 160;

const PRODUCT_REFERENCE_PATTERN = /\[([^\]]+)\]\(product:([a-z0-9]+(?:-[a-z0-9]+)*)\)/g;
const LEADING_DETERMINER = /^(?:the|a|an|these|this|those)\s+/i;

const GENERIC_LINK_LABELS = new Set([
  'check availability',
  'check current price',
  'check price',
  'check the current specifications',
  'view details',
  'view product details',
]);

export interface FeaturedProduct {
  slug: string;
  label: string;
  note: string | null;
  matchedBy: 'reference' | 'category';
}

export interface ReferencedProduct {
  slug: string;
  label: string | null;
}

export interface FeaturedSelectionInput {
  body: string;
  title: string;
  tags: string[];
  category: string | null;
  products: AffiliateProduct[];
  limit?: number;
}

export function normalizeLinkLabel(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  const withoutDeterminer = collapsed.replace(LEADING_DETERMINER, '');
  const label = withoutDeterminer === '' ? collapsed : withoutDeterminer;

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function isGenericLinkLabel(value: string): boolean {
  return GENERIC_LINK_LABELS.has(value.replace(/\s+/g, ' ').trim().toLowerCase());
}

export function extractReferencedProducts(body: string): ReferencedProduct[] {
  const seen = new Set<string>();
  const referenced: ReferencedProduct[] = [];

  for (const match of body.matchAll(PRODUCT_REFERENCE_PATTERN)) {
    const rawLabel = match[1];
    const slug = match[2];

    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    referenced.push({
      slug,
      label: isGenericLinkLabel(rawLabel) ? null : normalizeLinkLabel(rawLabel),
    });
  }

  return referenced;
}

export function shortenFeaturedNote(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed === '') {
    return null;
  }

  if (collapsed.length <= FEATURED_NOTE_MAX_LENGTH) {
    return collapsed;
  }

  return `${collapsed.slice(0, FEATURED_NOTE_MAX_LENGTH - 1).trimEnd()}…`;
}

export function selectFeaturedProducts(input: FeaturedSelectionInput): FeaturedProduct[] {
  const limit = Math.max(1, input.limit ?? FEATURED_PRODUCT_LIMIT);
  const bySlug = new Map(input.products.map((product) => [product.slug, product]));
  const selected: FeaturedProduct[] = [];
  const taken = new Set<string>();

  for (const reference of extractReferencedProducts(input.body)) {
    if (selected.length >= limit) {
      break;
    }

    const product = bySlug.get(reference.slug);
    if (!product) {
      continue;
    }

    taken.add(product.slug);
    selected.push({
      slug: product.slug,
      label: reference.label ?? product.name,
      note: shortenFeaturedNote(product.notes),
      matchedBy: 'reference',
    });
  }

  if (!input.category) {
    return selected;
  }

  const eligible = input.products.filter(
    (product) => !taken.has(product.slug) && product.topics.includes(input.category as string),
  );

  const ranked = rankCatalogForTopic(
    eligible.map((product) => ({
      product,
      slug: product.slug,
      name: product.name,
      topics: JSON.stringify(product.topics),
    })),
    { title: input.title, keywords: input.tags, category: input.category },
    eligible.length,
  );

  for (const entry of ranked) {
    if (selected.length >= limit) {
      break;
    }

    taken.add(entry.product.slug);
    selected.push({
      slug: entry.product.slug,
      label: entry.product.name,
      note: shortenFeaturedNote(entry.product.notes),
      matchedBy: 'category',
    });
  }

  return selected;
}
