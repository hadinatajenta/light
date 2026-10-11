import type { APIRoute } from 'astro';
import { SITE_DESCRIPTION, SITE_TAGLINE, SITE_TITLE } from '@/consts';
import { getPublishedPostSummaries } from '@/lib/content/public';
import { DEFAULT_SITE_ORIGIN } from '@/lib/seo/indexnow';

export const prerender = false;

export const GET: APIRoute = async () => {
  const posts = await getPublishedPostSummaries();

  const lines = [
    `# ${SITE_TITLE}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    SITE_TAGLINE,
    '',
    '## Guides',
    '',
    ...posts.map((post) => `- [${post.title}](${DEFAULT_SITE_ORIGIN}/blog/${post.id}/)`),
    '',
  ];

  return new Response(lines.join('\n'), {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};
