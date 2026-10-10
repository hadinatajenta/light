import type { APIRoute } from 'astro';
import { findClickTarget, readPostIdFromPath, recordClick } from '@/lib/affiliate/clicks';
import { resolveContentDatabase } from '@/lib/content/database';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('Not Found', { status: 404 });
  }

  const database = await resolveContentDatabase();
  if (!database) {
    return new Response('Not Found', { status: 404 });
  }

  const target = await findClickTarget(database, slug);
  if (!target) {
    return new Response('Not Found', { status: 404 });
  }

  const referrer = request.headers.get('Referer');
  let path: string | null = null;

  if (referrer) {
    try {
      path = new URL(referrer).pathname;
    } catch {
      path = null;
    }
  }

  try {
    await recordClick(database, {
      productId: target.productId,
      postId: readPostIdFromPath(path),
      path,
      referrer: referrer ? referrer.slice(0, 500) : null,
    });
  } catch (error) {
    console.error('Failed to record affiliate click', error);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.url,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
