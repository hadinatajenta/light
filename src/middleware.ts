import { defineMiddleware } from 'astro:middleware';
import { getAuthProvider } from '@/lib/auth';

const CANONICAL_HOST = 'lightscripts.com';
const REDIRECT_HOSTS = new Set(['www.lightscripts.com', 'light.hadinata.me']);

const PROTECTED_PREFIXES = ['/dashboard', '/api/dashboard'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (REDIRECT_HOSTS.has(context.url.hostname)) {
    const target = new URL(context.request.url);
    target.hostname = CANONICAL_HOST;
    target.protocol = 'https:';
    return Response.redirect(target.toString(), 301);
  }

  if (!isProtectedPath(context.url.pathname)) {
    return next();
  }

  const user = await getAuthProvider().getCurrentUser(context.request);
  if (!user) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  context.locals.user = user;
  return next();
});
