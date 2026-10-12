# Run log: backlog sweep

One session, phase by phase, at most two subagents per wave. Legend:
`[x]` done, `[~]` in progress, `[ ]` not started, `[!]` deferred with reason,
`(you)` needs the owner, `(dev)` engineering.

## Round 2 - agent roster and quality

Plan and rationale: `docs/status/plans/2026-10-12-agent-roster.md`.

- [~] Planner role that fills the topic queue with keyword driven topics (dev)
- [~] Writer specialisation: a category per writer, and writers only claim their own category (dev)
- [~] Raise `MAX_AGENTS` to 12 with a per role cap so writers cannot stack (dev)
- [~] Draft claiming for reviewers and QC so two reviewers cannot review the same draft (dev)
- [~] Per agent scorecard: runs, success rate, tokens, articles, tokens per article, approvals, revisions (dev)
- [ ] Second reviewer with a strict fact guardian prompt, created in production (dev)
- [ ] Writer A on `desk-setup` and Writer B on `chairs`, set in production (dev)
- [ ] Create the QC agent so the QC gate actually runs in production (you, dev)
- [ ] Per agent spending cap: deliberately after this round (dev)

## Phase 1 - stability

- [x] Run lock: claim the agent before running so overlapping ticks cannot run the same agent twice (dev)
- [x] Topic retry: attempts counter, backoff via next_attempt_at, and a terminal state after the limit (dev)
- [x] Failure alert: record an activity entry after repeated agent failures (dev)
- [x] Sanitize the rendered article HTML: neutralise raw HTML from markdown before `set:html` (dev)

## Phase 2 - gates and limits

- [x] Deterministic preflight before approval: hard content errors send the draft back to the writer (dev)
- [x] QC gate: a failed QC run sets `changes_requested` with its issues so the writer revises (dev)
- [x] Admin API rate limit beyond Cloudflare Access (dev)
- [x] Retention job for `activity` and `agent_runs` (dev)

## Phase 3 - observability

- [x] Activity store: metadata JSON, run id, target link, filters (actor, action, date, status), pagination (dev)
- [x] Agent run detail API and a retry action (dev)
- [x] Activity page: filter bar, pagination, and a run detail dialog with retry (dev)

## Phase 4 - media and SEO extras

- [x] Pexels image source with a configurable key and a fallback chain (dev)
- [x] Broken-link check in CI (scheduled, non blocking) (dev)
- [x] Core Web Vitals: document and expose a PageSpeed link from the SEO page (dev)
- [x] Configurable refresh window for the SEO audit (dev)

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

- [x] Update `docs/status/task.md` and `techdebt.md` for what shipped (dev)
- [x] Refresh the root `README.md` (dev)
- [x] Decide on the hanging `src/lib/cache/homepage.ts` deletion: nothing imports it, so the deletion stands (dev)
- [!] Category and tag URL mismatch: changing public URLs needs a deliberate redirect plan (dev)
- [!] Split `src/lib/affiliate/store.ts` and de-duplicate the product form URL preview: a focused refactor, not a late night change (dev)
- [x] Retire the one-shot `scripts/seed-pages.ts` (dev)
