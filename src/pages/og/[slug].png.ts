import type { APIRoute } from 'astro';
import { getPublishedPost } from '@/lib/content/public';
import { serveCardImage } from '@/lib/og/serve';

export const prerender = false;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const slug = params.slug;
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return notFound();
  }

  const post = await getPublishedPost(slug);
  if (!post || post.noindex) {
    return notFound();
  }

  try {
    return await serveCardImage({
      post,
      requestUrl: url,
      executionContext: locals.cfContext,
    });
  } catch (error) {
    console.error('Failed to render an OG card', error);
    return new Response('Card rendering failed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
