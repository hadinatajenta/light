import type { APIRoute } from 'astro';

export const prerender = false;

const KEY_PREFIX = 'media/';
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const GET: APIRoute = async ({ params, request }) => {
  const file = params.path;
  if (!file) {
    return new Response('Not Found', { status: 404 });
  }

  const { env } = await import('cloudflare:workers');
  const bucket = (env as unknown as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET;
  if (!bucket) {
    return new Response('Not Found', { status: 404 });
  }

  const object = await bucket.get(`${KEY_PREFIX}${file}`);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': object.httpMetadata?.cacheControl ?? IMMUTABLE_CACHE_CONTROL,
    ETag: object.httpEtag,
  });

  if (request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
};
