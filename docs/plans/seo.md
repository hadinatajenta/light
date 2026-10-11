# Plan: SEO operations toolkit

Status: executing in stages
Owner: engineering
Related: content store, editor, topics, sharing dashboard, seo utils

## Goals

Give the operator the tools the site is missing for real SEO:

- A deterministic SEO audit of every article, with a score and named issues.
- Keyword cannibalization and orphan page detection.
- A target keyword and search intent per article and per topic, checked at
  publish.
- Content refresh candidates (posts not updated in a while).
- A broken external-link checker with a stored result set.
- Structured data where it is honest: HowTo, Organization, and a stronger
  Article (publisher/author). No fabricated Product or Review ratings.

Non-goals:

- No keyword-volume API integration (paid, and out of scope).
- No backlink purchasing or vendor integration.
- No Core Web Vitals monitoring code (documented as an operator step).

## Data model (migration 0017_seo.sql)

- `posts.target_intent TEXT` (informational, commercial, transactional,
  navigational). `posts.focus_keyword` already exists.
- `topics.intent TEXT`.
- `seo_link_checks(url TEXT PRIMARY KEY, status_code INTEGER, ok INTEGER,
  error TEXT, checked_at TEXT)`.

## Stages

### Stage A - audit engine, links, refresh (backend) + intent wiring + dashboard

Backend core:
- `src/lib/seo/audit.ts`: pure `auditPost(input)` returning a score and issues
  (title length 10-70, description 50-160, no H1 in body, at least 4 H2, word
  count, target keyword in title/description/first paragraph/one H2/cover alt,
  at least two internal links, cover present); `findCannibalization(posts)`;
  `findOrphanPosts(posts, internalLinkGraph)`; `isRefreshCandidate(post, now)`.
- `src/lib/seo/link-check.ts`: extract external links from bodies, check them
  with timeouts and a concurrency cap, return results.
- `GET /api/dashboard/seo/audit`: `{ summary, posts[], cannibalization[],
  orphans[], brokenLinks[] }`.
- `POST /api/dashboard/seo/check-links`: bounded check of external links; store
  in `seo_link_checks`; return `{ checked, broken[] }`.
- Tests for the pure audit, cannibalization, orphan, and refresh functions.

Intent wiring:
- Add `target_intent` to `posts` (store create/update, post schema) and `intent`
  to `topics` (store create/update, schema), plus the editor and topic form.

Frontend:
- New `/dashboard/seo` page + `seo-audit.tsx` (summary, per-post issue list with
  filters, cannibalization, orphans, broken links, refresh candidates) + nav.
- Editor: a search intent select next to the focus keyword.
- Topics: an intent field in the create/edit form.

Acceptance: the audit API returns real data; the dashboard shows it; the editor
and topic form persist keyword and intent.

### Stage B - structured data

- `src/utils/seo.ts`: add `buildHowToJsonLd` and `buildOrganizationJsonLd`;
  extend `buildArticleJsonLd` with publisher and author.
- `PostLayout.astro`: emit HowTo for "how to" guides with H2 steps; keep Article
  and FAQ; add breadcrumb already present.
- Homepage: emit Organization.
- Explicitly do not fabricate Product/Review ratings; document why.

Acceptance: HowTo/Organization valid JSON-LD on the right pages; no invented
ratings.

### Stage C - Core Web Vitals (operator step, small code)

- Document PageSpeed Insights usage and what to watch after ads (LCP, CLS, INP).
- Optional: a manual link in the SEO dashboard to PageSpeed Insights for the
  site.

## Risks

- Cannibalization and orphan detection are heuristics; label them as hints, not
  verdicts.
- The broken-link checker hits external hosts; bound count, timeout, and
  concurrency, and never run it inline with publishing.
- Structured data must reflect real content; a wrong HowTo is worse than none.

## Decide during implementation

- Refresh window (default 180 days).
- Which audit checks are errors versus warnings.
- Whether to add the broken-link check to CI (flaky) or keep it on demand.
