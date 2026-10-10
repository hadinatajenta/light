import type { APIRoute } from 'astro';

export const prerender = false;

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const GET: APIRoute = async ({ request }) => {
  const key = new URL(request.url).pathname.replace(/^\/+/, '');

  const { env } = await import('cloudflare:workers');
  const bucket = (env as unknown as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET;

  const diagnostics = new Headers({
    'X-Media-Key': key,
    'X-Media-Bucket': bucket ? 'present' : 'missing',
  });

  if (!bucket) {
    return new Response('Not Found', { status: 404, headers: diagnostics });
  }

  const object = await bucket.get(key);
  if (!object) {
    const listed = await bucket.list({ prefix: 'media/' });
    diagnostics.set('X-Media-Objects', String(listed.objects.length));
    diagnostics.set('X-Media-First', listed.objects[0]?.key ?? 'none');
    return new Response('Not Found', { status: 404, headers: diagnostics });
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
