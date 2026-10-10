# Domains and serving

This guide explains which domains serve what, how redirects work, how access is protected, where the sitemap lives, and how media is served.

## Domains and their roles

| Domain | Role |
| --- | --- |
| `lightscripts.com` | The public site (the canonical host) |
| `www.lightscripts.com` | Redirects to `lightscripts.com` with a 301 |
| `light.hadinata.me` | Redirects to `lightscripts.com` with a 301 |
| `admin.hadinata.me` | Serves the dashboard |
| `admin.lightscripts.com` | Reserved for the dashboard; see the access note below |

All of these are Cloudflare custom domains declared in the `routes` list in `wrangler.jsonc`, so the same Worker answers on each host and the application decides what to do.

The two redirects are handled in `src/middleware.ts`. It has a canonical host of `lightscripts.com` and a redirect set of `www.lightscripts.com` and `light.hadinata.me`. Any request to a redirect host is answered with an HTTP 301 to the same path on the canonical host.

## Cloudflare Access

The dashboard and its API are protected. `src/middleware.ts` treats `/dashboard` and every path under it, plus `/api/dashboard` and every path under it, as protected. For a protected path it checks the Cloudflare Access identity on the request (the `cf-access-jwt-assertion` header, verified against your Access team and audience). If there is no valid identity, it returns a plain **404**, not a login page and not a redirect.

Important consequence: if the Access application is missing or misconfigured for a host, the dashboard does not prompt for login. It simply looks like the pages do not exist, because every protected request is answered with 404.

- `admin.hadinata.me` is the host where the dashboard is served today. It must have a Cloudflare Access application in front of it.
- `admin.lightscripts.com` is declared as a route, but its Cloudflare Access application does not exist yet. Until that Access application is created, requests to `/dashboard` on that host are answered with 404 because there is no Access identity. Do not point the owner at that host until the Access application exists.

The team and audience used to verify Access are set as Worker vars (`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`) in `wrangler.jsonc`. The Access applications themselves are configured in the Cloudflare dashboard, not in this repository.

## Search Console

- The sitemap is generated at `/sitemap.xml` and lists `https://lightscripts.com/sitemap.xml`.
- `public/robots.txt` already points crawlers at that sitemap URL.
- Submit the sitemap in Google Search Console using the Sitemap report, entering `sitemap.xml` for the `lightscripts.com` property.
- The property is verified through Cloudflare.

## Media serving

Images uploaded to the media library are stored in Cloudflare R2 and served from the same domain under `/media/`. The route `src/pages/media/[...path].ts` only serves keys that start with `media/` and rejects paths containing `..`. Responses carry the stored content type and a one-year immutable cache header, and they answer `If-None-Match` with a 304 when the object has not changed.

So a media URL always looks like `/media/<uuid>.<extension>` and is served directly from R2 through the Worker, not from the dashboard.

## If the domain changes

When you move the site to a different domain, update all of these:

1. `astro.config.mjs`: the `site` value (currently `https://lightscripts.com`).
2. `public/robots.txt`: the `Sitemap:` URL.
3. `wrangler.jsonc`: the `routes` list, so the new host is a custom domain.
4. `src/middleware.ts`: `CANONICAL_HOST` and `REDIRECT_HOSTS`, so the canonical host and the 301 redirects match the new domain.
5. Re-submit the sitemap in Search Console for the new property.

## Not built yet

- There is no redirect manager. The **Redirects** page in the dashboard is a placeholder, and `public/_redirects` is empty. Redirects are only the two host redirects in the middleware.
