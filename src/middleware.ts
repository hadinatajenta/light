import { defineMiddleware } from 'astro:middleware';
import { getAuthProvider } from '@/lib/auth';
import {
  isCacheableHomepageRequest,
  readCachedHomepage,
  storeHomepageResponse,
} from '@/lib/cache/homepage';
import { resolveContentDatabase } from '@/lib/content/database';
import { getRedirectByPath, recordRedirectHit } from '@/lib/redirects/store';

const CANONICAL_HOST = 'lightscripts.com';
const REDIRECT_HOSTS = new Set(['www.lightscripts.com', 'light.hadinata.me']);
const PRODUCTION_HOSTS = new Set([
  CANONICAL_HOST,
  'www.lightscripts.com',
  'light.hadinata.me',
  'admin.lightscripts.com',
  'admin.hadinata.me',
]);

const PROTECTED_PREFIXES = ['/dashboard', '/api/dashboard'];
const REDIRECT_EXCLUDED_PREFIXES = ['/_astro', '/media', '/api', '/go'];
const REDIRECT_METHODS = new Set(['GET', 'HEAD']);

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isExcludedFromRedirects(pathname: string): boolean {
  return REDIRECT_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasFileExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() ?? '';
  return lastSegment.includes('.');
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (PRODUCTION_HOSTS.has(context.url.hostname) && context.url.protocol === 'http:') {
    const target = new URL(context.request.url);
    target.protocol = 'https:';
    return Response.redirect(target.toString(), 301);
  }

  if (REDIRECT_HOSTS.has(context.url.hostname)) {
    const target = new URL(context.request.url);
    target.hostname = CANONICAL_HOST;
    target.protocol = 'https:';
    return Response.redirect(target.toString(), 301);
  }

  const { pathname } = context.url;
  const isHomepage = isCacheableHomepageRequest(context.request);

  if (isHomepage) {
    const cached = await readCachedHomepage(context.url.toString());
    if (cached) {
      return cached;
    }
  }

  if (
    REDIRECT_METHODS.has(context.request.method) &&
    !hasFileExtension(pathname) &&
    !isExcludedFromRedirects(pathname)
  ) {
    try {
      const database = await resolveContentDatabase();
      const redirect = database ? await getRedirectByPath(database, pathname) : null;

      if (database && redirect) {
        const executionContext = context.locals.cfContext;
        if (executionContext) {
          executionContext.waitUntil(
            recordRedirectHit(database, redirect.id).catch(() => undefined),
          );
        }

        const target = new URL(redirect.toPath, context.url.origin);
        return Response.redirect(target.toString(), redirect.statusCode);
      }
    } catch {
      return next();
    }
  }

  if (!isProtectedPath(pathname)) {
    const response = await next();

    if (!isHomepage) {
      return response;
    }

    return storeHomepageResponse(context.url.toString(), response, (task) => {
      context.locals.cfContext?.waitUntil(task);
    });
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
