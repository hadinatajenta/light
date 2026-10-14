# Tier 1 and Tier 2 delivery, and the Performance Analyst

Recorded 2026-10-13. This covers the work ordered after the external review of
`reducing-eye-strain-at-a-desk-distance-lighting-breaks`, plus the new Performance Analyst
agent. Every claim below was checked against production D1 or the live site.

## Tier 1: correctness fixes

| # | Change | Where | Verified how |
| --- | --- | --- | --- |
| 1 | The article cover is now the `og:image` and `twitter:image`, with the site default as fallback | `PostLayout.astro` passes `image={post.coverUrl ?? undefined}`, which flows through the existing `BaseHead` resolver | The eye-strain article now returns `og:image = https://lightscripts.com/media/4ef56579-f619-4431-99a5-9866ac9ee5bc.jpg` instead of the shared default |
| 2 | Article tag labels are human readable | `PostLayout.astro` renders `topicLabel(tag)`; the `href` still uses the raw slug | The footer reads `Eye Strain, Monitor Setup, Desk Ergonomics, Buying Basics` |
| 3 | Product matching uses the article tags as well as its category | `src/lib/affiliate/featured.ts` gained `ARTICLE_TAG_CATEGORIES` | The eye-strain article now lists `Quntis eye-care monitor light bar` and `2250LM clamp desk lamp` alongside the two products the body references. This is the review's headline complaint, resolved |
| 4 | The planner may no longer file a product-adjacent topic under `buying-basics` | planner prompt in `roles.ts` | Prompt rule added; applies to the next planner run |
| 5 | Re-categorise mis-filed posts | not needed | The 7 uncategorised posts were fixed earlier; the eye-strain post deliberately stays under `buying-basics` because its content is about judging a specification, and item 3 now covers its product matching |

## Tier 2: packaging and conversion

Implemented as writer and planner instructions, because the article body is where the packaging
lives and the writer already receives the product list and the published titles.

- **Quick answer.** The body must now open with an H2 titled `Quick answer` carrying the two to
  four numbers or decisions, in at most six lines. A visual callout box is not built: the section
  renders as ordinary prose. That is a styling follow-up, not a content gap.
- **Question-shaped H2s.** Headings must now be the question or the decision the reader arrives
  with.
- **Glossed jargon.** Every technical term must be explained in parentheses on first use.
- **Contextual internal links.** The writer must link two or three published articles inline, in
  the section where they belong, using `[text](/blog/slug/)`. This required a real code change:
  the writer was given titles only, so it could not build a valid path. `listRecentPublishedPosts`
  now supplies id and title, and the writer message carries `/blog/<id>/`.
- **A closing section.** The body must end with `If the free fixes are not enough`, a table of
  three to four buyer situations each paired with one product slug. This is the missing next step
  after the checklist.
- **Commercial intent.** The planner previously forbade any "best of" list. It now forbids the
  broad year-stamped roundup and the padded listicle while allowing a narrow comparison whose
  title names the one situation it settles, such as "the best monitor light bar for a bright
  room". This reopens money pages without turning the site into a listicle farm, and it is a
  policy change the owner can reverse.

**Not done, and why.** The review asked for a "best for" line and two or three checkable
specifications per product. Only 2 of 91 products have notes, and writing specifications from a
product name would be fabrication, which the site's own standards forbid. The rendering support
waits on a note-writing pass with real sources and a human approval step.

## The Performance Analyst

A sixth agent. Pure backend: it makes no model calls. Verified in production on the live cron, with
`tokens_out` null and a summary of `Reviewed 47 published posts, 11 views, and 41 clicks for
2026-09-15 to 2026-10-12: 1 new, 0 refreshed, 0 preserved, 0 expired, 0 auto-resolved; sources
unavailable: gsc, ga4, affiliate_report`.

### Three structural defects that had to be fixed first

An adversarial review found these, and each one would have made the feature silently useless:

1. `requireDeepseekKey` and the budget gate ran before every role branch, so a non-LLM agent would
   have failed with `DEEPSEEK_KEY_MISSING` or been skipped when the budget was paused. The analyst
   branch now runs above both, and a role that matches no branch throws `UNKNOWN_AGENT_ROLE`
   instead of being recorded as a false success. `branches.test.ts` asserts every role has a
   terminal branch.
2. `runs_per_day` is clamped to 1..96, so "weekly" was not expressible. A `schedule_mode` column
   now holds `manual`, `daily`, or `weekly`, with `computeAgentNextRunAt`. The trap that
   `next_run_at IS NULL` counts as due, which would have made a manual agent run every fifteen
   minutes, is closed in `listDueAgents` and `claimAgentRun`.
3. `finishAgentRun` had no `AND status = 'running'` guard, so a run finishing after the reaper
   closed it overwrote the failure with a success. The guard is in place.

### Cannot be deleted

`system_managed` on the agent row, `systemManaged` on the role definition, and guards in
`createAgent`, `updateAgent`, `setAgentEnabled`, and `deleteAgent`, which return 409
`AGENT_PROTECTED`. The migration adds a partial unique index so only one can exist, and D1 triggers
that abort a delete or a role change on the system row. A reconciler in `run-due.ts` recreates the
row within one tick if it is removed by raw SQL.

**Where the guarantee honestly ends.** Anyone with D1 console access can drop the triggers and
delete the row, and a future migration that rebuilds the `agents` table, as `0012` did for
`clicks`, would silently drop them. Deletion is refused through every supported path, detected
within fifteen minutes, and repaired. That is the real promise.

### Rules that run today, and the ones that wait

Working from D1 only: `no_affiliate_link` (traffic and no product reference), `dead_target` (a
referenced product that cannot resolve), `broken_placement` (clicks on a product whose program or
tracking id is broken), `redirect_misses` (a `/go/` slug returning 404), and `zero_views`. Each
stores its own evidence, thresholds, and window, so a finding can always be reproduced.

Dormant until credentials exist: `title_meta` and `refresh` need Search Console, and the
zero-commission rule needs an imported report. A stale or missing report is never read as zero
commission. The affiliate report has no import path at all yet, and has no per-page or per-product
dimension even when it exists, because the link template carries no `ascsubtag`. That is the
single largest gap in the analyst and it needs an owner decision, not more code.

### Wiring

The two notification events are emitted from the runner: `analyst.findings.ready` when a run stores
or refreshes a finding, and `analyst.sources.degraded` with a seven-day dedupe so an absent Google
credential cannot push weekly. Both are added to the notification catalogue and appear in the
Telegram settings checkboxes. The dashboard lives at `/dashboard/analyst`, in the Automation group,
with a findings queue, filters, an evidence panel, and a schedule card.

## Extra fixes made during this work

- **Click placement.** Every `/go/` link now carries `?p=body|list|rail|sponsored`, recorded in a
  new `clicks.placement` column, validated against a closed allowlist so the column cannot become
  a free-text sink. The owner asked for link position; this is what delivers it.
- **Silent 404s.** A `/go/` slug that does not resolve now increments `redirect_misses` instead of
  failing invisibly, which turns an existing revenue leak into a finding.
- **Empty model responses.** The recurring `The model did not return a JSON object. Received 0
  characters` failure killed runs repeatedly. `createChatCompletion` now retries once, with a
  bounded two-attempt limit, when a response carries neither content nor reasoning, and returns the
  empty completion unchanged after that so existing error mapping is untouched.
- **An index on `clicks (post_id, created_at)`**, because per-post click counts were scanning.

## What was deliberately not done

| Item | Reason |
| --- | --- |
| Search Console and GA4 connectors | They need a Google Cloud service account that does not exist. Writing untestable OAuth and API code would ship unverified work. The analyst reports the exact remediation instead, and the rules activate with no redesign once credentials are added |
| Affiliate report import | It has no per-page dimension, because the link template lacks a sub-id. Importing it would produce an unattributable number. The `ascsubtag` decision comes first |
| Product notes and "best for" lines | Writing specifications from a bare product name is fabrication |
| Taxonomy consolidation | Merging roughly twenty free-form tags into the fifteen categories changes URLs and indexation. The label fix shipped; the merge needs the owner's call |
| Email capture | It stores personal data, so it needs double opt-in, an unsubscribe path, and a privacy policy update. That is a commitment, not a widget |
| Interactive calculator, SVG diagrams, geo-aware links | Each is its own project. Geo links additionally need the owner's Amazon Associates configuration, because each storefront needs its own tag |
