import { marked } from 'marked';
import { resolveAffiliateLinks } from '../affiliate/links';
import type { PostStatus } from './post-schema';
import { toSlug } from './slug';
import { getPost, listPosts } from './store';

export interface SiteHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface SitePostSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string | null;
  status: PostStatus;
  pubDate: string | null;
  updatedDate: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
}

export interface SitePost extends SitePostSummary {
  body: string;
  seoTitle: string | null;
  canonical: string | null;
  noindex: boolean;
  focusKeyword: string | null;
  affiliate: boolean;
  faq: Array<{ question: string; answer: string }>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function readFaq(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (entry): entry is { question: string; answer: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { question?: unknown }).question === 'string' &&
        typeof (entry as { answer?: unknown }).answer === 'string',
    )
    .map((entry) => ({ question: entry.question, answer: entry.answer }));
}

function emptySummary(id: string): SitePostSummary {
  return {
    id,
    title: id,
    description: '',
    tags: [],
    category: null,
    status: 'draft',
    pubDate: null,
    updatedDate: null,
    coverUrl: null,
    coverAlt: null,
  };
}

export async function getPublishedPostSummaries(): Promise<SitePostSummary[]> {
  const posts = await listPosts();
  const published = posts.filter((post) => post.status === 'published');

  return published.map((post) => ({
    id: post.id,
    title: post.title,
    description: post.description,
    tags: post.tags,
    category: post.category,
    status: post.status,
    pubDate: post.pubDate,
    updatedDate: post.updatedDate,
    coverUrl: post.coverUrl,
    coverAlt: post.coverAlt,
  }));
}

export async function getPublishedPost(id: string): Promise<SitePost | null> {
  const document = await getPost(id).catch(() => null);
  if (!document) {
    return null;
  }

  const data = document.data;
  const status = typeof data.status === 'string' ? data.status : 'draft';

  if (status !== 'published') {
    return null;
  }

  return {
    ...emptySummary(id),
    title: readString(data.title) || id,
    description: readString(data.description),
    tags: readTags(data.tags),
    category: typeof data.category === 'string' ? data.category : null,
    status: 'published',
    pubDate: typeof data.pubDate === 'string' ? data.pubDate : null,
    updatedDate: typeof data.updatedDate === 'string' ? data.updatedDate : null,
    coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : null,
    coverAlt: typeof data.coverAlt === 'string' ? data.coverAlt : null,
    body: document.body,
    seoTitle: typeof data.seoTitle === 'string' ? data.seoTitle : null,
    canonical: typeof data.canonical === 'string' ? data.canonical : null,
    noindex: data.noindex === true,
    focusKeyword: typeof data.focusKeyword === 'string' ? data.focusKeyword : null,
    affiliate: data.affiliate === true,
    faq: readFaq(data.faq),
  };
}

export function extractHeadings(body: string): SiteHeading[] {
  const tokens = marked.lexer(body);

  return tokens
    .filter((token) => token.type === 'heading')
    .map((token) => {
      const heading = token as { depth: number; text: string };
      return { depth: heading.depth, slug: toSlug(heading.text), text: heading.text };
    })
    .filter((heading) => heading.depth === 2 || heading.depth === 3);
}

export interface RenderResult {
  html: string;
  affiliateLinks: number;
  unresolvedProductSlugs: string[];
}

export function renderMarkdown(
  body: string,
  affiliateLinks: Map<string, string> = new Map(),
): RenderResult {
  const rawHtml = marked.parse(body, { async: false }) as string;

  const withHeadingIds = rawHtml.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_match, depth: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, '');
      return `<h${depth} id="${toSlug(text)}">${inner}</h${depth}>`;
    },
  );

  const resolved = resolveAffiliateLinks(withHeadingIds, affiliateLinks);

  return {
    html: resolved.html,
    affiliateLinks: resolved.affiliateLinks,
    unresolvedProductSlugs: resolved.unresolvedSlugs,
  };
}

export function formatReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
