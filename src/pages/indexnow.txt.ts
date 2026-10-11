import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  let key: string | undefined;

  try {
    const { env } = await import('cloudflare:workers');
    key = (env as unknown as { INDEXNOW_KEY?: string }).INDEXNOW_KEY;
  } catch {
    key = undefined;
  }

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(key, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};
