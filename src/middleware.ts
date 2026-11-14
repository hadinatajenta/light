import { defineMiddleware } from 'astro:middleware';
import type { APIContext, MiddlewareNext } from 'astro';
import {
  normalizeViewPath,
  postIdFromViewPath,
  schedulePostViewRecording,
} from '@/lib/analytics/views';
import { getAuthProvider } from '@/lib/auth';
import {
  isCacheablePageRequest,
  resolveDefaultPageCache,
  servePublicPage,
} from '@/lib/cache/page-cache';
import { resolveContentDatabase } from '@/lib/content/database';
import { getRedirectByPath, recordRedirectHit } from '@/lib/redirects/store';
import { buildTrailingSlashRedirect } from '@/lib/redirects/trailing-slash';

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

async function findRedirectResponse(context: APIContext): Promise<Response | null> {
  const { pathname } = context.url;

  if (
    !REDIRECT_METHODS.has(context.request.method) ||
    hasFileExtension(pathname) ||
    isExcludedFromRedirects(pathname)
  ) {
    return null;
  }

  const database = await resolveContentDatabase();
  const redirect = database ? await getRedirectByPath(database, pathname) : null;

  if (!database || !redirect) {
    return null;
  }

  const executionContext = context.locals.cfContext;
  if (executionContext) {
    executionContext.waitUntil(recordRedirectHit(database, redirect.id).catch(() => undefined));
  }

  const target = new URL(redirect.toPath, context.url.origin);
  return Response.redirect(target.toString(), redirect.statusCode);
}

async function renderRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  try {
    const redirectResponse = await findRedirectResponse(context);
    if (redirectResponse) {
      return redirectResponse;
    }
  } catch (error) {
    console.error('Failed to resolve a redirect', error);
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
}

async function recordCachedPostView(context: APIContext): Promise<void> {
  const postId = postIdFromViewPath(normalizeViewPath(context.url.pathname));
  if (!postId) {
    return;
  }

  const database = await resolveContentDatabase();
  if (!database) {
    return;
  }

  await schedulePostViewRecording({
    database,
    request: context.request,
    postId,
    executionContext: context.locals.cfContext,
  });
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

  const trailingSlashRedirect = buildTrailingSlashRedirect(context.request, context.url);
  if (trailingSlashRedirect) {
    return trailingSlashRedirect;
  }

  if (!isCacheablePageRequest(context.request, context.url)) {
    return renderRequest(context, next);
  }

  return servePublicPage({
    request: context.request,
    url: context.url,
    pageCache: resolveDefaultPageCache(),
    executionContext: context.locals.cfContext,
    renderPage: () => renderRequest(context, next),
    onCacheHit: () => recordCachedPostView(context),
  });
});
