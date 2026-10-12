# SEO

This guide covers the Tier 0 SEO surface: what gets submitted to search engines, how new posts are announced, and the machine-readable files the site publishes.

The site is a single Cloudflare Worker serving `https://lightscripts.com`. The canonical host, redirects, and the sitemap are covered in [domain.md](./domain.md).

## Google Search Console

1. Add the `lightscripts.com` property and verify it through Cloudflare.
2. Open the **Sitemap** report and submit `sitemap.xml`. The file is served at `https://lightscripts.com/sitemap.xml` and listed in `public/robots.txt`.
3. Re-submit the sitemap whenever the URL structure changes, not after every post.

Search Console is the source of truth for indexing: check **Pages** for coverage errors and the **Sitemaps** report for the last time Google fetched the sitemap.

## Cloudflare Crawler Hints

Crawler Hints tells Cloudflare to notify participating search engines when content changes, so they re-crawl sooner without you doing anything.

1. In the Cloudflare dashboard, open the `lightscripts.com` zone.
2. Go to **Caching** > **Crawler Hints**.
3. Turn it on.

Crawler Hints uses IndexNow under the hood and does not need the key below. It is complementary to the on-publish ping.

## IndexNow

IndexNow pushes a changed URL straight to participating search engines (Bing, Yandex, Seznam, Naver). The site pings it on every publish, best effort, so a failure never blocks a publish.

### The key

IndexNow proves ownership by serving a key file. The key lives in the `INDEXNOW_KEY` Worker secret and the same value is served at `/indexnow.txt`.

Set the secret:

```sh
wrangler secret put INDEXNOW_KEY
```

Use a value of 8 to 128 characters from `a-z`, `A-Z`, `0-9`, and `-`. The route `src/pages/indexnow.txt.ts` reads `INDEXNOW_KEY` at request time and returns it as `text/plain`, or a 404 when it is not configured. `src/lib/seo/indexnow.ts` uses `https://lightscripts.com/indexnow.txt` as the `keyLocation`.

Set the same variable in `.dev.vars` for local runs if you want to test pings locally.

### The ping

The helper `notifyIndexNow(paths)` posts `{ host, key, keyLocation, urlList }` to `https://api.indexnow.org/indexnow` with a 5 second timeout. It returns `false` and logs a short message instead of throwing, and it skips non-https URLs. When `INDEXNOW_KEY` is missing it returns `false` without a request.

Three publish paths call it after a post becomes public:

- The reviewer auto-publish path in `src/lib/agents/review.ts` (`publishPost`).
- The scheduled publisher in `src/lib/scheduling/store.ts` (`publishDuePosts`), once per published post.
- The dashboard status route `src/pages/api/dashboard/posts/[id]/status.ts` when the submitted status is `published`.

The endpoint is idempotent, so re-pinging a URL is harmless. To confirm delivery, check the IndexNow response is a `2xx` and watch Worker logs for `IndexNow ping failed`.

## Related posts

The post layout renders related links at request time. `getRelatedPosts(current, limit)` in `src/lib/content/related.ts` reads published summaries and scores each candidate as `sharedTags * 2 + (sameCategory ? 1 : 0)`. Candidates with a score of zero are dropped, the rest are ordered by score then title, and the result is sliced to the limit (4 by default).

Nothing is persisted, so the related links always reflect the current set of published posts and their tags and category. Tag and category quality directly drives link quality: keep the taxonomy consistent.

## llms.txt

`https://lightscripts.com/llms.txt` is a plain-text map for language models and other non-browser clients. It starts with the site title, description, and tagline, then a **Guides** section listing every published post as a Markdown link to `https://lightscripts.com/blog/<id>/`.

The route `src/pages/llms.txt.ts` is generated at request time from the published summaries, so it stays current with no build step. It returns `200` with `Content-Type: text/plain`.

## Checklist for a new post

1. Publish it (dashboard, reviewer auto-publish, or the schedule).
2. Confirm the automatic IndexNow ping reached the endpoint (Worker logs, or a `2xx` in the IndexNow response).
3. Confirm the post appears in `sitemap.xml` and `llms.txt`.
4. Confirm related links render on the post and on its neighbours.

## Structured data

The site emits JSON-LD for:

- **Article** on every guide, including `author`, `publisher` (with a logo), `datePublished`, and `dateModified`.
- **BreadcrumbList** on guides and pages.
- **FAQPage** when a post has FAQ entries.
- **WebSite** and **Organization** on the homepage, and **ItemList** for the homepage post list.

We deliberately do **not** emit **Product** or **Review** rich results: they require real offers, prices, and aggregate ratings, and inventing them violates Google's structured-data policy. Add them only when we have trustworthy data (verified price/rating with a source).

**HowTo** rich results were deprecated by Google in 2023, so we do not emit HowTo markup. The steps still live in the article body as H2 sections, which is what readers and Google use.

## Core Web Vitals

Core Web Vitals are a field measurement, not something to hardcode. After ads are live, check them:

1. Open PageSpeed Insights for the homepage and one guide, or use the CrUX report in Search Console.
2. Watch **LCP** (main image and ads), **CLS** (ad slots reserving height, fonts), and **INP** (interaction cost of ads and scripts).
3. The ad slots already reserve height through `min-height` classes, which is the main CLS control. Re-check after any new ad format is enabled.

## Off-page signals and social profiles

Off-page SEO is everything that signals authority from outside the site: links
from other sites, brand mentions, and social profiles. On-page work (titles,
structure, internal links) decides whether a page can rank; off-page signals
decide how much weight Google gives the domain. For a new site they are the
slowest part, and none of it can be faked.

What matters, in order:

1. **Being indexed and linked from your own other properties.** Profiles,
   directories, and community answers that point at a real guide.
2. **Links you earn.** An original data study, a measurement, or a comparison
   nobody else has published is what earns links. Paid link networks are a
   policy violation and a penalty risk, so we do not buy links.
3. **Brand mentions.** Being named in a forum thread, a newsletter, or a
   roundup helps even without a link.
4. **Social profiles.** Weak as a ranking factor, useful for discovery and for
   the `sameAs` signal that ties the brand together for entity recognition.

### Social profiles

Add a profile once it exists: edit `SOCIAL_PROFILES` in `src/consts.ts` and list
the label plus the full URL. The footer renders the row only when the list is
non-empty, and the homepage `Organization` structured data picks the same URLs
up as `sameAs`, which is what audits look for. Do not list a profile that does
not exist: an empty or placeholder link is worse than none.

Existing distribution already covers Telegram, Bluesky, Discord, Mastodon, and
Pinterest through the sharing outbox, so a new guide reaches those channels
without a personal social account.

### What the third-party audit messages mean

- **"Too many dofollow links"** is generic for a new domain. It means the audit
  could not see a backlink profile, not that our links violate anything. Our
  affiliate links already carry `rel="sponsored nofollow"`.
- **"Authority score: no competitor data"** means the tool has no data for the
  domain yet. It resolves with age and links, not with a code change.
- **"Missing hreflang"** does not apply: the site publishes one language
  (`en-US`). Add hreflang only if a translated version ships.
- **"Title too short"** was real for the homepage, which used the bare brand
  name. The homepage now has a descriptive title of about sixty characters.
- **Performance claims** should be re-checked with PageSpeed Insights, which
  measures the live page. The AdSense script in the head is the largest
  third-party script and the first suspect for interaction and blocking time.

## SEO audit dashboard

`/dashboard/seo` renders a deterministic audit built from the article content: title and description length, H1/H2 structure, word count, target keyword placement, internal links, cover, plus keyword cannibalization, orphan posts, refresh candidates (not updated in 180 days), and broken external links. Use it before and after publishing. The external link check is on demand and bounded; run it occasionally rather than on every page load.
