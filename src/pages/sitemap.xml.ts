import type { APIRoute } from 'astro';
import { POSTS_PER_PAGE } from '@/consts';
import { getPublishedPostSummaries } from '@/lib/content/public';
import { collectPaginationPaths, collectTagPaths, toLastModified } from '@/utils/sitemap';

const STATIC_PATHS = [
  '/',
  '/blog/',
  '/about/',
  '/contact/',
  '/affiliate-disclosure/',
  '/privacy-policy/',
  '/cookie-policy/',
  '/terms/',
];

const MINIMUM_TAG_POSTS = 2;

interface SitemapEntry {
  path: string;
  lastModified?: string;
}

function toEntryXml(entry: SitemapEntry, origin: URL): string {
  const lines = [`    <loc>${new URL(entry.path, origin).href}</loc>`];

  if (entry.lastModified) {
    lines.push(`    <lastmod>${entry.lastModified}</lastmod>`);
  }

  return `  <url>\n${lines.join('\n')}\n  </url>`;
}

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const origin = context.site ?? new URL(context.url.origin);
  const posts = await getPublishedPostSummaries();

  const entries: SitemapEntry[] = [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...posts.map((post) => ({
      path: `/blog/${post.id}/`,
      lastModified: toLastModified(post.updatedDate ?? post.pubDate),
    })),
    ...collectTagPaths(posts, MINIMUM_TAG_POSTS).map((path) => ({ path })),
    ...collectPaginationPaths(posts.length, POSTS_PER_PAGE).map((path) => ({ path })),
  ];

  const urls = entries.map((entry) => toEntryXml(entry, origin)).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
