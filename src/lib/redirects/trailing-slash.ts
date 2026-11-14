const REDIRECTABLE_METHODS = new Set(['GET', 'HEAD']);
const EXCLUDED_PATH_PREFIXES = ['/api', '/dashboard', '/media', '/go'];

function isExcludedPath(pathname: string): boolean {
  if (pathname.startsWith('/_')) {
    return true;
  }

  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasFileExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() ?? '';
  return lastSegment.includes('.');
}

export function buildTrailingSlashRedirect(request: Request, url: URL): Response | null {
  const { pathname } = url;

  if (
    !REDIRECTABLE_METHODS.has(request.method) ||
    pathname.endsWith('/') ||
    hasFileExtension(pathname) ||
    isExcludedPath(pathname)
  ) {
    return null;
  }

  const target = new URL(url.href);
  target.pathname = `${pathname}/`;
  return Response.redirect(target.toString(), 301);
}
