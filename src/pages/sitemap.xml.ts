import type { APIRoute } from 'astro';
import { getPublishedPostSummaries } from '@/lib/content/public';

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

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const origin = context.site ?? new URL(context.url.origin);
  const posts = await getPublishedPostSummaries();
  const paths = [...STATIC_PATHS, ...posts.map((post) => `/blog/${post.id}/`)];
  const entries = paths
    .map((path) => `  <url><loc>${new URL(path, origin).href}</loc></url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
