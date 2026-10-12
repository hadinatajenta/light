# task.md - what is done and what is next

Companion to [light.md](light.md). Keep this updated as work lands.

Legend: `[x]` done, `[ ]` not started, `[~]` in progress, `(you)` needs the
owner, `(dev)` is engineering work.

---

## Phase 0 - foundation

- [x] Astro 7 project scaffold, TypeScript, Tailwind v4, React islands (dev)
- [x] shadcn/ui component base (dev)
- [x] Public site editorial redesign (dev)
- [x] Cloudflare Workers deployment wired (dev)
- [x] Git repo `hadinatajenta/light` on `main` (dev)
- [x] `npm run verify` pipeline (content, types, lint, tests, build) (dev)

## Phase 1 - content platform

- [x] Cloudflare Access protecting the admin host (dev, you configured the app)
- [x] Admin API for posts, categories, tags, media (dev)
- [x] Post editor with SEO panel (dev)
- [x] Posts table with filters, multi-select, archive and delete (dev)
- [x] Category manager plus inline category creation (dev)
- [x] Media library backed by R2 (dev)
- [x] D1 as the content store, instant publish (dev)
- [x] Custom domain `lightscripts.com` plus www redirect (dev)
- [x] Old host `light.hadinata.me` 301s to the apex (dev)
- [x] Brand renamed to "Light Scripts" (dev)
- [x] Sitemap with lastmod and tag pages, robots.txt (dev)
- [x] D1 to markdown backup job (dev)
- [x] Dashboard overview with real metrics (dev)
- [x] Activity log for users and agents (dev)

## Phase 2 - agents

- [x] Agents storage, roles, review gate (dev)
- [x] DeepSeek client with thinking mode and error mapping (dev)
- [x] Encrypted DeepSeek key storage (dev)
- [x] Agents UI: list, create, edit, enable and disable (dev)
- [x] Manual "Run agent" per agent (dev)
- [x] Cron Worker for scheduling (dev)
- [ ] **Save the DeepSeek API key** on the Agents page (you)
- [ ] Create the first real agents (you)
- [ ] Watch a full scrapper to writer to reviewer cycle on a real topic (you, dev)

## Phase 3 - monetisation (next priority)

- [x] Decide the target audience: **United States and EU** (Amazon Associates,
      optional Impact, plus AdSense). Decided 2026-10-11. (you)
- [x] Register **Amazon Associates** and get a tracking id: `lightscripts-20` (you)
- [x] Configure the Amazon program in `src/config/monetization.ts` (dev)
- [x] Affiliate storage: `affiliate_programs` plus `affiliate_products`, Amazon
      seeded (migration `0004_affiliate`) (dev)
- [x] Link rewriting: `product:<slug>` becomes a real Amazon URL with
      `rel="sponsored nofollow noopener"` (dev)
- [x] Affiliate disclosure gate: renders when a post has affiliate links, and
      the editor now has the affiliate toggle (was hardcoded to false) (dev)
- [x] Build the affiliate product catalog UI and the Monetization menu (dev)
- [x] Teach the writer agent to reference only catalog products (dev)
- [x] Monetization menu with programs, catalog, bulk import, ads, disclosure,
      and a broken reference report (dev)
- [ ] **Add real products to the catalog** so articles can carry affiliate
      links (you)
- [ ] Optional: register Impact or ShareASale for software and services (you)
- [ ] Enable an ad network and set real slot ids (you, dev)
- [ ] Replace the placeholder `ads.txt` (you)

## Phase 4 - content engine

- [x] Topic queue in D1, FIFO claiming, requeue on failure (dev)
- [x] Writer and reviewer wired to the catalog and the review gate (dev)
- [x] Seed the first 40 topics (dev)
- [x] Three agents created in production: Writer A, Writer B, Reviewer (dev)
- [x] First six articles published (dev)
- [ ] **Save the DeepSeek API key** so the agents can run (you)
- [ ] Watch a full scrapper to writer to reviewer cycle on a real topic (you, dev)
- [ ] Reach 30 published articles (you, dev)
- [x] First article written end to end by the agents: researcher notes, writer draft, reviewer decision (dev)
- [ ] Reach 100 published articles (you, dev)

## Phase 5 - growth and measurement

- [x] **Click tracking**: every `product:<slug>` link renders as `/go/<slug>`, the redirect records the click and forwards to the affiliate URL with the tracking id (dev)
- [x] **Analytics snapshot**: one endpoint covering content, pipeline, agents, affiliate, activity, and media (dev)
- [x] **Dashboard rebuilt** from real data: hero metrics, publishing cadence chart, content mix, pipeline funnel, agents, affiliate, activity (dev)
- [x] **Insights rebuilt**: content performance, agent operations with token and cost estimates, affiliate readiness, automation health (dev)
- [x] **Sidebar redesigned**: grouped navigation, collapsible rail with the choice remembered, email moved out of the sidebar into a header account menu (dev)
- [x] **Scrapper wired to the pipeline**: the researcher collects notes into `sources` and the writer only claims researched topics (dev)
- [x] **Content audit**: automated SEO and quality scan with an actionable report (dev)
- [x] **Scheduled publishing**: a future publication date keeps a post as a draft until the cron publishes it, and only an approved draft is ever auto-published (dev)
- [ ] Re-submit the sitemap in Search Console (you)
- [ ] Request indexing for the current articles (you)
- [ ] Build the Insights page on the Search Console API (dev)
- [ ] Review Search Console data weekly and prune or expand topics (you)

## Phase 6 - admin polish

Every dashboard page is real now: Dashboard, Posts (plus the editor), Pages,
Media, Categories, Tags, Agents, Topics, Research, SEO, Sharing, Activity,
Insights, Redirects, Monetization, and Settings.

- [x] Affiliate toggle in the post editor, so the disclosure can render (dev)
- [x] Pages menu with full CRUD, and the six static pages moved to D1 (dev)
- [x] Media library: upload, find images, alt text, delete, copy URL (dev)
- [x] Topic queue UI, so topics can be managed without the API (dev)
- [x] Agent cost and token reporting on the Insights page (dev)
- [x] Refresh the root `README.md` (dev)
- [x] Render the `in-article-bottom` ad slot (`in-article-mid` is still unused) (dev)
- [ ] Fix the category and tag URL mismatch: the category editor previews
      `/tag/<slug>/` but that route filters by post tags (dev)
- [ ] Split `src/lib/affiliate/store.ts`, which is 650 lines (dev)

## Phase 7 - reliability, observability, and media

- [x] Claim an agent atomically before a run, so overlapping ticks cannot run
      the same agent twice (dev)
- [x] Topic attempts with backoff and a terminal `dead` state, plus an activity
      alert after three failed runs (dev)
- [x] Deterministic preflight and a QC gate that send a draft back to the writer
      instead of publishing it (dev)
- [x] Neutralise raw HTML from markdown before `set:html` (dev)
- [x] Per user rate limit on the admin API (dev)
- [x] Retention for `activity` and `agent_runs` (90 days, twice a day) (dev)
- [x] Activity filters, pagination, structured metadata, a run detail dialog,
      and a retry action (dev)
- [x] Pexels as the preferred image source, with a key card and an Openverse
      fallback (dev)
- [x] Configurable SEO refresh window, a PageSpeed link, and a weekly
      non blocking link check workflow (dev)
- [x] Planner role that fills the topic queue from seed keywords and the covered categories (dev)
- [x] Animated pipeline flow graph on the Agents page, with per stage backlog and agent cadence (dev)
- [x] Writer beats: several categories per writer, so no category is left without an owner (dev)
- [x] Per agent scorecard on the Agents page over 7, 30, or 90 days (dev)
- [x] Atomic draft claim for reviewers and QC, so two reviewers cannot review one draft (dev)
- [x] `MAX_AGENTS` raised to 12 with a per role cap (dev)
- [ ] Refresher role that updates the published articles flagged for refresh (dev)
- [ ] Per agent spending cap: the budget is still global (dev)
- [ ] Mandatory fact-check stage before the editorial review (dev)
- [ ] Performance feedback loop from `/go` clicks into topic priority (dev)
- [ ] Keyword volume data: needs a paid provider decision (you)
- [ ] Product and Review structured data: needs real ratings, do not fabricate (dev)

## Infrastructure backlog

- [ ] `admin.lightscripts.com` Access app, then remove `admin.hadinata.me` (you, dev)
- [ ] Configure Workers Builds watch paths so content backup commits do not
      trigger a rebuild (you)
- [ ] Set the GitHub repo secrets `CLOUDFLARE_API_TOKEN` and
      `CLOUDFLARE_ACCOUNT_ID` so the backup workflow can run (you)

---

## Blocked

| Item | Blocked by |
| --- | --- |
| Agents producing content | DeepSeek API key not saved yet |
| Affiliate links in articles | Product catalog is empty |
| Ads on the site | No ad network configured yet |
| Insights page with real data | No Search Console API credentials yet |
| Admin on `admin.lightscripts.com` | No Access app for that host yet |

## Definition of done for `light`

`light` is finished when all of the following hold:

1. At least 100 published articles across the target topics.
2. Every article that recommends a product links through a real affiliate
   tracking id.
3. An ad network is live on the article pages.
4. Search Console shows steady organic impressions and clicks.
5. Revenue is at or above Rp100k per day for a sustained month.
