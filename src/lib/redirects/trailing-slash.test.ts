import { describe, expect, it } from 'vitest';
import { buildTrailingSlashRedirect } from './trailing-slash';

function redirectFor(url: string, method = 'GET'): Response | null {
  return buildTrailingSlashRedirect(new Request(url, { method }), new URL(url));
}

describe('buildTrailingSlashRedirect', () => {
  it('permanently redirects a page path to its trailing-slash canonical', () => {
    const response = redirectFor('https://lightscripts.com/blog/gemini-4-hydrogen-explained');

    expect(response?.status).toBe(301);
    expect(response?.headers.get('Location')).toBe(
      'https://lightscripts.com/blog/gemini-4-hydrogen-explained/',
    );
  });

  it('keeps the query string on the redirect target', () => {
    const response = redirectFor('https://lightscripts.com/blog?page=2');

    expect(response?.headers.get('Location')).toBe('https://lightscripts.com/blog/?page=2');
  });

  it('redirects HEAD requests the same way as GET', () => {
    expect(redirectFor('https://lightscripts.com/about', 'HEAD')?.status).toBe(301);
  });

  it.each([
    ['the root path', 'https://lightscripts.com/'],
    ['a path that already ends with a slash', 'https://lightscripts.com/about/'],
    ['a file path', 'https://lightscripts.com/sitemap.xml'],
    ['an API path', 'https://lightscripts.com/api/search'],
    ['a dashboard path', 'https://admin.lightscripts.com/dashboard/posts'],
    ['a media path', 'https://lightscripts.com/media/cover'],
    ['an outbound link path', 'https://lightscripts.com/go/partner'],
    ['an Astro internal path', 'https://lightscripts.com/_server-islands/Comments'],
  ])('leaves %s alone', (_label, url) => {
    expect(redirectFor(url)).toBeNull();
  });

  it('leaves non-GET requests alone', () => {
    expect(redirectFor('https://lightscripts.com/contact', 'POST')).toBeNull();
  });
});
