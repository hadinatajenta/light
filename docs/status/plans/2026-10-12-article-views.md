# Article views on the Insights page

Decision recorded 2026-10-12, applied to production the same day. This documents where the view
numbers come from, why no third-party service was used, and how the metrics are computed.

## The question that came first

The owner asked whether an API or a signup was needed. The answer, and the reason:

| Option | What it requires | Verdict |
| --- | --- | --- |
| Self-tracked in D1 | Nothing | Chosen |
| Cloudflare Web Analytics | Enabling it in the Cloudflare dashboard, a beacon script in the site, and an **Account Analytics: Read** API token stored as a Worker secret so the dashboard can read the GraphQL API | Available later as a second source |
| Google Analytics 4 | A property, a service account, the Data API, and service-account JWT signing inside a Worker | Not worth it |
| Plausible, Umami, Fathom | Paid, or self-hosted elsewhere, and their stats APIs need a key | Not worth it |

The deciding factor was not the setup cost. It was that a self-tracked table can be **joined with
the `clicks` table**, because both key on the article slug. That produces an affiliate click rate
per article, which no third-party page-view tool can give, and which is the most useful number on
the page.

## What was built

- `migrations/0025_post_views.sql` adds `post_views (day, path, post_id, count, updated_at)` keyed
  on `(day, path)`. One row per article per day, so the table grows by the number of published
  articles each day, not by the number of visits.
- `src/lib/analytics/views.ts` holds the pure helpers (day keys, path normalisation, bot detection,
  change percentages, opportunities) plus the aggregate queries.
- `src/pages/blog/[...slug].astro` records a view through `locals.cfContext.waitUntil`, the same
  non-blocking pattern `/go/[slug].ts` already used for clicks. A failing write cannot slow or
  break the page.
- `src/pages/api/dashboard/views.ts` serves the snapshot to the island.
- `src/components/dashboard/views-panel.tsx` is the client island: three headline cards, the chart,
  the summary strip, the most-viewed table, and the two opportunity lists.
- The existing `line-chart.tsx` was extended rather than duplicated: it gained a `bar` variant,
  a style toggle, and label props, and was renamed `chart-panel.tsx` because it no longer draws
  only lines. Both existing call sites keep the old behaviour through default props.

## Day boundaries

`VIEW_DAY_TIME_ZONE` is `Asia/Jakarta`, so "today" resets at midnight for the operator rather than
at 07:00. This is deliberate: the pipeline diagram on the Agents page counts a UTC day, which is
why the same page can show "3 done today" next to a 24-hour counter reading 38. Views do not
repeat that mistake, and the time zone is stated in the panel copy.

## What is counted

The panel says this in the UI, and it matters when reading the numbers:

- Server-side, so a reader without JavaScript is still counted.
- Crawlers that identify themselves are excluded by User-Agent (search engines, social previews,
  uptime monitors, command-line clients).
- Prefetch and prerender requests are excluded, so a hovered link does not count as a read.
- **Crawlers that present a browser User-Agent are still counted.** The numbers are a direction,
  not an absolute.
- Nothing personal is stored. No IP address, no cookie, no User-Agent, no referrer. Only the day,
  the path, and a counter.

## The metrics

| Metric | How it is computed |
| --- | --- |
| Today, last 7 days, last 30 days | Sum of counts, each with the previous equal-length period and the change |
| Views per day | Sum over the selected range divided by the range length |
| Views per published article | Sum over the range divided by the published article count |
| Busiest day | The peak of the series, or nothing when the range has no views |
| Most viewed articles | Views per article in the range, joined to the title and category, capped at 12 |
| Click rate | Affiliate clicks for that article in the range divided by its views |
| Read but not clicked | Articles with views and no clicks, worst first. A monetisation gap. |
| Best converting | The highest click rate, so the structure can be copied. |

The click rate measures interest, not sales. Amazon does not report orders back to the site, so no
revenue figure is claimed anywhere.

## Verification

Against production, with real requests:

| Action | Result |
| --- | --- |
| Three browser views of one article | `count = 3` |
| Two browser views of a second article | `count = 2` |
| One `Googlebot` request | Not recorded |
| One request with `Purpose: prefetch` | Not recorded |
| The top-posts query, with its join and clicks subquery | Ran correctly against production D1 |
| The daily series query | Ran correctly against production D1 |

## Expectation to set

Counting starts the moment this shipped. The 30-day chart, the 7-day and 30-day cards, and the
previous-period comparisons are therefore empty or say `no earlier data` until history builds up.
That is the feature working, not a bug. The numbers become decision-useful after roughly a week.

## Not built yet

- Only article views are counted. The homepage, category pages, and the search dialog are not, so
  there is no total site traffic figure.
- There is no referrer, country, device, or session-length breakdown. Adding those needs the
  Cloudflare Web Analytics source described above.
- A view is a page render, not a read. There is no scroll depth or time-on-page measure.
- Nothing prunes `post_views`. At one row per article per day it stays small, but a retention job
  belongs in the maintenance pass if the article count grows.
- Views cannot be attributed to a channel, so the affiliate click rate mixes direct, search, and
  social traffic.
