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
- [ ] Reach 100 published articles (you, dev)

## Phase 5 - growth and measurement

- [ ] Re-submit the sitemap in Search Console (you)
- [ ] Request indexing for the current articles (you)
- [ ] Build the Insights page on the Search Console API (dev)
- [ ] Set up click tracking on affiliate links (dev)
- [ ] Review Search Console data weekly and prune or expand topics (you)

## Phase 6 - admin polish

Placeholder pages today: Media, Pages, Insights, Redirects, Monetization,
Settings. Real pages today: Dashboard, Posts (plus the editor), Categories,
Agents, Activity.

- [x] Affiliate toggle in the post editor, so the disclosure can render (dev)
- [x] Pages menu with full CRUD, and the six static pages moved to D1 (dev)
- [ ] Media library UI: upload grid, alt text, delete, copy URL (dev)
- [ ] Topic queue UI, so topics can be managed without the API (dev)
- [ ] Fix the category and tag URL mismatch: the category editor previews
      `/tag/<slug>/` but that route filters by post tags (dev)
- [ ] Render the `in-article-mid` and `in-article-bottom` ad slots (dev)
- [ ] Redirects menu (currently a placeholder) (dev)
- [ ] Settings menu (currently a placeholder) (dev)
- [ ] Agent cost and token reporting (dev)
- [ ] Split `src/lib/affiliate/store.ts`, which is 650 lines (dev)
- [ ] Refresh the stale root `README.md` (it still describes a static site) (dev)

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
