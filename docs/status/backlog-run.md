# Run log: backlog sweep

One session, phase by phase, at most two subagents per wave. Legend:
`[x]` done, `[~]` in progress, `[ ]` not started, `[!]` deferred with reason,
`(you)` needs the owner, `(dev)` engineering.

## Phase 1 - stability

- [x] Run lock: claim the agent before running so overlapping ticks cannot run the same agent twice (dev)
- [x] Topic retry: attempts counter, backoff via next_attempt_at, and a terminal state after the limit (dev)
- [x] Failure alert: record an activity entry after repeated agent failures (dev)
- [x] Sanitize the rendered article HTML: neutralise raw HTML from markdown before `set:html` (dev)

## Phase 2 - gates and limits

- [ ] Deterministic preflight before approval: hard content errors send the draft back to the writer (dev)
- [ ] QC gate: a failed QC run sets `changes_requested` with its issues so the writer revises (dev)
- [ ] Admin API rate limit beyond Cloudflare Access (dev)
- [ ] Retention job for `activity` and `agent_runs` (dev)

## Phase 3 - observability

- [ ] Activity store: metadata JSON, run id, target link, filters (actor, action, date, status), pagination (dev)
- [ ] Agent run detail API and a retry action (dev)
- [ ] Activity page: filter bar, pagination, and a run detail dialog with retry (dev)

## Phase 4 - media and SEO extras

- [ ] Pexels image source with a configurable key and a fallback chain (dev)
- [ ] Broken-link check in CI (scheduled, non blocking) (dev)
- [ ] Core Web Vitals: document and expose a PageSpeed link from the SEO page (dev)
- [ ] Configurable refresh window for the SEO audit (dev)

## Phase 5 - deferred this run

- [!] Topic Planner and Refresher agent roles: needs a product decision on how topics are generated and refreshed (dev)
- [!] Performance feedback loop from `/go` clicks into topic priority: needs a scoring model agreed first (dev)
- [!] Search Console API insights: blocked on credentials (you)
- [!] Product/Review structured data: needs real ratings, do not fabricate (dev)
- [!] Keyword volume provider: paid API, needs a decision (you)

## Owner actions (not code)

- [ ] Re-submit the sitemap in Search Console and request indexing (you)
- [ ] Cloudflare Access app for `admin.lightscripts.com`, remove `admin.hadinata.me` (you)
- [ ] GitHub secrets for the backup workflow plus Workers Builds watch paths (you)
- [ ] Fill the affiliate product catalog and set real ad slot ids (you)
- [ ] Pinterest app approval, then OAuth with write scopes (you)
- [ ] Backlink outreach (HARO/digital PR) and an original data study (you, dev)

## Phase 6 - housekeeping (documents and refactors)

- [ ] Update `docs/status/task.md` and `techdebt.md` for what shipped (dev)
- [ ] Refresh the root `README.md` (dev)
- [ ] Decide on the hanging `src/lib/cache/homepage.ts` deletion (dev)
- [ ] Category and tag URL mismatch (dev)
- [ ] Split `src/lib/affiliate/store.ts` and de-duplicate the product form URL preview (dev)
- [ ] Retire the one-shot `scripts/seed-pages.ts` (dev)
