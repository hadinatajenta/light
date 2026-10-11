# Landing page design

Design proposal for the homepage (`src/pages/index.astro`) of Light Scripts.
This document is for review. Nothing described here is implemented yet.

## Goals

- Tell a first-time visitor what the site is and why it can be trusted, above the fold.
- Keep the editorial, monochrome magazine identity.
- Make the featured guide the clear entry point on every screen size.
- Separate monetization from editorial content without hiding it.
- Hit Core Web Vitals targets: LCP under 2.5 s, CLS under 0.1.

## Non-goals

- A visual page builder or per-visitor personalization.
- Real-time content. The page may be cached for a short time.
- A redesign of article pages, the dashboard, or the topic panel.

## Current state

- Header, then topic tabs, then a three-column magazine grid (`1 : 1.35 : 1`), then `AdBanner`, then footer.
- Seven fixed post slots. A placeholder sponsor box sits at the bottom of the right column.
- No `<h1>`, no intro, no link to the full archive.
- Rendered on every request (`prerender = false`).

See the review findings that motivated this document in the sections below.

## Proposed layout

Desktop (1024 px and wider):

```
┌──────────────────────────────────────────────────────────┐
│ Header: brand · Topics · Guides · About · Contact · tools │
├──────────────────────────────────────────────────────────┤
│ Intro (h1 + one line + 3 trust points)                    │
├──────────────────────────────────────────────────────────┤
│ Topic tabs (scrollable, with edge fade)                   │
├───────────────┬────────────────────────┬─────────────────┤
│ Card 2        │ FEATURE (card 1)       │ Card 5          │
│ Card 4 (text) │ Card 3                 │ Card 6 (text)   │
│ Card 7        │                        │ Card 8          │
├───────────────┴────────────────────────┴─────────────────┤
│ "View all guides" link                                    │
├──────────────────────────────────────────────────────────┤
│ Sponsored block (full width, clearly labelled)            │
├──────────────────────────────────────────────────────────┤
│ Footer                                                    │
└──────────────────────────────────────────────────────────┘
```

### Sections

| Section | Content | Notes |
| --- | --- | --- |
| Intro | `h1`, a single supporting sentence, three trust points | Compact, at most 160 px tall on desktop. |
| Topic tabs | Latest plus the ten topics from `TOPICS` | Fix the "Latest" target, add an edge fade on overflow. |
| Magazine grid | Eight published posts | Columns balanced to equal height. |
| Archive link | "View all guides" to `/blog/` | Required, since only eight posts are shown. |
| Sponsored block | Real partner offer, or hidden | Never render placeholder copy. |
| Ad banner | `AdBanner` | Reserved height to avoid layout shift. |

### Intro copy (draft)

- `h1`: "Buying guides that hold up after the unboxing."
- Support line: reuse `SITE_DESCRIPTION` from `src/consts.ts`.
- Trust points: "Independent research", "Sources cited", "Affiliate links disclosed" with a link to `/affiliate-disclosure/`.

## Responsive behavior

| Breakpoint | Columns | Order |
| --- | --- | --- |
| 1025 px and wider | 3 | left, feature, right |
| 681 to 1024 px | Feature full width, then 2 columns | feature first (already implemented) |
| 680 px and narrower | 1 | **feature first**, then remaining posts in rank order |

Mobile order is a fix: today the feature card appears after three cards from the left column.
Use one ranked list and place cards with CSS grid areas instead of three DOM columns, so the DOM order matches the rank order and screen readers read it correctly.

## Visual design

- Keep the palette: ink `#24252a` on paper `#ffffff`, with the existing `ink-*` opacity ramp and dark mode tokens.
- Add one accent color for links, CTAs, and the sponsored label. Candidate: a deep teal or amber. It must reach 4.5:1 against both paper and the dark background.
- Increase the feature card's weight: larger title (`clamp(30px, 3.2vw, 44px)`), 16:10 image, description shown at a larger size.
- Cards without a cover use `--paper-deep` with the category initial, not a solid black block.
- Raise the contrast of small text: tags and meta from `ink-40` to at least `ink-60`.
- Unify radii. Choose either the editorial 2 px or the shadcn `0.375rem`, and apply it to images, sponsored block, and buttons.
- Motion stays as is: 220 ms ease-out hover lift, respecting `prefers-reduced-motion`.

## Monetization placement

- One sponsored block per page, full width, after the grid. It is visually distinct from articles: tinted background, "Sponsored" label, link to the disclosure page.
- Shown only when a real product or program exists. Otherwise nothing is rendered.
- `AdBanner` sits below the sponsored block with a fixed reserved height.
- Affiliate links on this page carry `rel="sponsored noopener"`.

## Agents and content supply

The homepage shows what the content agents publish, so its freshness depends on them. Limits below come from the code and are what the page can rely on.

### How agents run

- Agents are managed in the dashboard and stored in D1. Four roles exist: `writer`, `reviewer`, `qc`, `scrapper` (`AGENT_ROLES` in `src/lib/agents/roles.ts`).
- A separate Cloudflare Worker, `light-agents`, fires a cron every 15 minutes (`*/15 * * * *`). It calls `POST /api/agents/run-due` on the main app with a bearer token.
- The endpoint selects every agent whose schedule is due and runs them **one after another in a `for` loop**, awaiting each run. There is no parallel execution.

### Limits

| Limit | Value | Source |
| --- | --- | --- |
| Agents that can be created | **6** | `MAX_AGENTS` in `roles.ts` |
| Agents running at the same time | **1** (strictly sequential) | `run-due.ts` loop |
| Runs per agent per day | 1 to 96 | `MIN_RUNS_PER_DAY`, `MAX_RUNS_PER_DAY` |
| Cron interval | 15 minutes (96 ticks per day) | `workers/agents/wrangler.jsonc` |
| Time budget per tick | 240 s, minus 30 s safety margin, so 210 s of run time | `RUN_BUDGET_MS`, `RUN_SAFETY_MS` |
| Minimum time left to start a run | 20 s | `MIN_RUN_MS` |
| Stale run cutoff | 20 minutes, then marked failed and the topic is released | `docs/agents.md` |
| Cover backfill | One cover per tick, when no agents are due or at least 60 s remain | `COVER_MIN_REMAINING_MS` |

### What this means for the homepage

- Because runs are sequential, with 210 s per tick, a tick may not finish every due agent. Unprocessed agents are reported as `remaining` and run on the next tick, 15 minutes later.
- With six agents all due in the same tick, later agents can be delayed by at least one tick.
- Practical upper bound for new content: each tick processes only what fits in 210 s, so output is a few drafts per hour at most, not six in parallel.
- A writer only produces drafts. A post appears on the homepage after a reviewer approves it and that reviewer has auto publish enabled, or after a human publishes it.
- The homepage must therefore handle fewer than eight published posts (empty and sparse states, see below).

### Options if more throughput is needed (not planned)

- Raise `MAX_AGENTS` only if runs fit the budget. More agents without more run time just queue.
- Run agents concurrently with `Promise.all`. This needs a limit on concurrent DeepSeek calls to respect rate limits (`DEEPSEEK_RATE_LIMITED`), and per-agent deadlines.
- Shorten the cron interval. Cloudflare allows a one-minute minimum, but every tick re-queries D1.

## Data and caching

- Query: `getPublishedPostSummaries()` limited to eight posts, ordered by publish date.
- Keep server rendering.
- **Caching is not implemented, deliberately.** `Cache-Control: public, s-maxage=300` alone does nothing on a Worker response, and storing the homepage in the Cache API was tried and reverted: once Cloudflare serves a cached response it rewrites the browser `max-age` to the zone's Browser Cache TTL (measured: `max-age=14400`), so a returning visitor would keep a four hour old homepage. That is worse than the five minute publishing lag this section was meant to allow. Rendering the page on every request costs roughly 100 ms and keeps the homepage honest. Revisit only if the zone's Browser Cache TTL is first set to "Respect Existing Headers".
- Load footer and site settings once per request and share the result: done, through `locals` in `src/lib/settings/request.ts`.

## Empty and sparse states

| Published posts | Behavior |
| --- | --- |
| 0 | Show the intro and topic tabs, with a short "Guides are on the way" message. No grid. |
| 1 to 3 | Single-column feature layout, no empty columns. |
| 4 to 7 | Grid fills in rank order and the columns rebalance. |
| 8 or more | Full layout. |

## SEO and accessibility

- Exactly one `h1` (the intro). Card titles use `h2`.
- Keep `WebSite` JSON-LD. Add `ItemList` JSON-LD for the listed posts.
- Feature image: `loading="eager"`, `fetchpriority="high"`, explicit `width` and `height`. All other images lazy.
- Cover images keep their `alt` and are not wrapped in `aria-hidden`. Only the glyph fallback is hidden.
- Tags link to `/tag/<slug>/`.
- Whole card is the click target (already done with the title link overlay).
- Respect `prefers-reduced-motion`. Keep focus rings visible on cards, tabs, and CTAs.

## Open questions

1. Which accent color should be used?
2. Should the intro include an email signup, or stay informational?
3. Eight posts on the page, or keep seven?
4. Is a five-minute cache acceptable, or should publishing purge the cache?
5. Should agents stay sequential, or should concurrent runs be added?

## Rollout

1. Intro, `h1`, heading levels, archive link.
2. Ranked list with grid areas, mobile order, balanced columns, sparse states.
3. Visual changes: feature weight, no-cover style, contrast, radii, accent.
4. Sponsored block and ad banner placement.
5. Caching and shared settings query.
6. Verify with `npm run verify`, then check Lighthouse on mobile and desktop.
