# Task: monetization menu, pages CRUD, agents, and the first articles

Big feature run, started 2026-10-11. Check items off as they land.

Plan of record: [2026-10-11-monetization-pages-agents.md](../../plans/2026-10-11-monetization-pages-agents.md)

## Decisions taken by the owner

- Monetization menu: build it as complex as possible. It is a core revenue feature.
- Agents: create them **enabled**, 24 runs per day, and process the topic queue FIFO.
- Reviewer: auto publish stays on, so an approved draft publishes itself.
- Footer legal links: engineering choice, do what is best.
- Legal text: written and published by the agent, no further review step.
- Scope: all three parts in one run.

## Part A - monetization backend and UI

- [ ] Migration `0005_monetization.sql` (topics, is_active, clicks table, settings seeds)
- [ ] Generic settings store, agents settings re-exports it
- [ ] Affiliate store extended with reference counts and click stats
- [ ] API: programs list, create, update, delete with the in-use guard
- [ ] API: products list with search, filter, pagination, affiliate URL preview
- [ ] API: product create, update, delete
- [ ] API: bulk import with per-line errors
- [ ] API: settings (ads, ads.txt, disclosure)
- [ ] API: report (broken references, top products, clicks)
- [ ] UI: Programs page with the manager island
- [ ] UI: Catalog page with the table, filters, pagination
- [ ] UI: Product form with a live affiliate link preview
- [ ] UI: Bulk import dialog
- [ ] UI: Settings page with ads, disclosure, and the report
- [ ] UI: "Needs attention" panel for broken references

## Part B - agents

- [ ] Migration `0007_topics.sql` (topic queue)
- [ ] Topic store: claim oldest queued, mark in progress, mark used, requeue on failure
- [ ] Writer runner claims a topic; empty queue exits without calling the model
- [ ] Writer prompt replaced with the owner's senior commerce editor reference
- [ ] Writer prompt receives the catalog slice and must emit `product:<slug>` links
- [ ] QC role fails a draft that references an unknown product slug
- [ ] API and UI for the topic queue
- [ ] Create Writer A, Writer B, and Reviewer in production (enabled, 24 per day)
- [ ] Seed the topic queue with a first batch of real topics

## Part C - pages

- [ ] Migration `0006_pages.sql`
- [ ] Pages store and API
- [ ] Public `[slug]` route and `PageLayout`
- [ ] Admin list, create, and edit
- [ ] Six static pages converted to markdown and seeded
- [ ] Six static `.astro` files removed
- [ ] Footer legal links driven from D1
- [ ] Sitemap includes published pages
- [ ] Legal text (privacy, terms) written and published

## Content

- [ ] Write the first batch of articles and publish them to production D1
- [ ] Verify each article renders on the live site
- [ ] Confirm the sitemap and the backup export include them

## Integration and verification

- [ ] Apply migrations to local and remote
- [ ] Full `npm run verify` green
- [ ] Commit and push in logical commits
- [ ] Verify the live site after deploy
- [ ] Update `light.md`, `task.md`, and `techdebt.md` with what landed

## Notes and blockers

- The DeepSeek API key is **not saved yet**, so the agents cannot run until the
  owner adds it on the Agents page. Until then every agent run records a failed
  run and no tokens are spent.
- Because of that, the first articles in this run are written directly by the
  agent rather than by the DeepSeek pipeline. They follow the same editorial
  prompt the writer role will use.
- Product affiliate links cannot be fabricated. Articles ship without affiliate
  links until real products are added to the catalog.
