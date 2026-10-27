import { SITE_LOCALE, SITE_TITLE } from '../consts';

export function buildPageTitle(pageTitle?: string): string {
  if (!pageTitle) {
    return SITE_TITLE;
  }

  return `${pageTitle} | ${SITE_TITLE}`;
}

export function buildCanonicalUrl(siteUrl: URL | undefined, pathname: string): string | undefined {
  if (!siteUrl) {
    return undefined;
  }

  return new URL(pathname, siteUrl).href;
}

export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface ArticleJsonLdInput {
  title: string;
  description: string;
  url: string;
  datePublished: Date;
  authorName: string;
  authorUrl?: string;
  authorSameAs?: string[];
  authorJobTitle?: string;
  publisherName?: string;
  publisherLogoUrl?: string;
  image?: string;
  dateModified?: Date;
}

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const publisherName = input.publisherName ?? input.authorName;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    mainEntityOfPage: input.url,
    datePublished: input.datePublished.toISOString(),
    dateModified: (input.dateModified ?? input.datePublished).toISOString(),
    author: {
      '@type': 'Person',
      name: input.authorName,
      ...(input.authorUrl ? { url: input.authorUrl } : {}),
      ...(input.authorJobTitle ? { jobTitle: input.authorJobTitle } : {}),
      ...(input.authorSameAs && input.authorSameAs.length > 0
        ? { sameAs: input.authorSameAs }
        : {}),
      worksFor: { '@type': 'Organization', name: publisherName },
    },
    publisher: {
      '@type': 'Organization',
      name: publisherName,
      ...(input.publisherLogoUrl
        ? { logo: { '@type': 'ImageObject', url: input.publisherLogoUrl } }
        : {}),
    },
    ...(input.image ? { image: [input.image] } : {}),
  };
}

export function buildOrganizationJsonLd(input: {
  name: string;
  url: string;
  logoUrl?: string;
  sameAs?: string[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  };
}

export function buildWebsiteJsonLd(input: {
  name: string;
  url: string;
  description: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: SITE_LOCALE,
  };
}

export function buildItemListJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqJsonLd(
  items: { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
