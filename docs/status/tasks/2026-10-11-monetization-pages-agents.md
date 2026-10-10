# Task: monetization menu, pages CRUD, agents, and the first articles

Big feature run, started 2026-10-11. Status: **complete** except for the items
listed under "Remaining".

Plan of record: [2026-10-11-monetization-pages-agents.md](../../plans/2026-10-11-monetization-pages-agents.md)

## Decisions taken by the owner

- Monetization menu: build it as complex as possible. It is a core revenue feature.
- Agents: create them **enabled**, 24 runs per day, and process the topic queue FIFO.
- Reviewer: auto publish stays on, so an approved draft publishes itself.
- Footer legal links: engineering choice, do what is best. Done: driven from D1.
- Legal text: written and published by the agent, no further review step.
- Scope: all three parts in one run.

## Part A - monetization backend and UI

- [x] Migration `0005_monetization.sql` (topics, is_active, clicks table, settings seeds)
- [x] Generic settings store in `src/lib/settings/store.ts`, agents settings re-exports it
- [x] Affiliate store extended with CRUD, reference counts, and click stats
- [x] API: programs list, create, update, delete with the in-use guard
- [x] API: products list with search, filter, pagination, server-built affiliate URL
- [x] API: product create, update, delete
- [x] API: bulk import with per-line errors
- [x] API: settings (ads, ads.txt, disclosure)
- [x] API: report (broken references, top products, clicks, inactive products)
- [x] UI: Programs page with the manager island and a status strip
- [x] UI: Catalog page with the table, filters, pagination, row actions
- [x] UI: Product form with a live affiliate link preview
- [x] UI: Bulk import dialog
- [x] UI: Settings page with ads, disclosure, and the report
- [x] UI: "Needs attention" panel for broken references

## Part B - agents

- [x] Migration `0007_topics.sql` (topic queue)
- [x] Topic store: claim oldest queued, mark in progress, mark used, requeue on failure
- [x] Writer runner claims a topic; an empty queue exits without calling the model
- [x] Writer prompt replaced with the owner's senior commerce editor reference
- [x] Writer prompt receives the catalog slice and must emit `product:<slug>` links
- [x] NEEDS RESEARCH is honoured: the topic is blocked with the model's note
- [x] API for the topic queue (list, create, bulk import, requeue, delete)
- [x] Create Writer A, Writer B, and Reviewer in production (enabled, 24 per day)
- [x] Seed the topic queue: 40 topics, 6 already used by this run

## Part C - pages

- [x] Migration `0006_pages.sql`
- [x] Pages store and API
- [x] Public `[slug]` route and `PageLayout`
- [x] Admin list, create, and edit
- [x] Six static pages converted to markdown and seeded
- [x] Six static `.astro` files removed
- [x] Footer legal links driven from D1, with a hard coded fallback
- [x] Sitemap includes published pages with `lastmod`
- [x] Legal text (privacy, terms, cookies, affiliate disclosure) written and published

## Content

- [x] Write the first batch of articles and publish them to production D1
- [x] Verify each article renders on the live site
- [x] Confirm the sitemap includes them

## Integration and verification

- [x] Apply migrations to local and remote
- [x] Full `npm run verify` green: 0 errors, 137 files linted, 84 tests, build clean
- [x] Commit and push in logical commits
- [x] Verify the live site after deploy

## What landed on the live site

- 13 published articles, up from 7. Six are new, written in this run.
- 6 pages now served from D1 instead of hand written files.
- 3 agents enabled in production, 40 topics queued.
- Sitemap now 26 URLs.

## Remaining

- [ ] **Save the DeepSeek API key** on the Agents page. Until then every agent
      run records a failed run and no tokens are spent. This is the single
      blocker between the current state and a self-running content pipeline.
- [ ] Add real products to the affiliate catalog. Articles ship without
      affiliate links because product data cannot be invented.
- [ ] Enable an ad network and replace the placeholder `ads.txt`.
- [ ] Split `src/lib/affiliate/store.ts` (650 lines, above the repo guideline).
- [ ] Add a topic queue UI so topics can be managed without the API.

## Notes

- The six articles in this run were written directly by the agent, not by the
  DeepSeek pipeline, because the API key is not saved yet. They follow the same
  editorial prompt the writer role uses.
- Product affiliate links were deliberately omitted. The writer prompt forbids
  inventing URLs, ASINs, prices, or ratings, and the catalog is empty.
- The agents will pick up the remaining 34 topics in FIFO order once the key is
  saved. The reviewer publishes approved drafts automatically.
