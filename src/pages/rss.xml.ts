import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/consts';
import { getPublishedPostSummaries } from '@/lib/content/public';

export const prerender = false;

export async function GET(context: APIContext) {
  const posts = await getPublishedPostSummaries();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site ?? context.url.origin,
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.pubDate ? new Date(post.pubDate) : new Date(),
      link: `/blog/${post.id}/`,
    })),
  });
}
