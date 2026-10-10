import { defineMiddleware } from 'astro:middleware';
import { getAuthProvider } from '@/lib/auth';

const PROTECTED_PREFIXES = ['/dashboard', '/api/dashboard'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
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
