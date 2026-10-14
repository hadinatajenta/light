# techdebt.md - known debt and shortcuts

Shortcuts taken on purpose, with the reason and the trigger that should make us
pay them back. Nothing here is a surprise bug; each item is a conscious trade.

Severity: **high** (fix soon, real risk), **medium** (fix when the trigger
fires), **low** (accept for now).

---

## high

### Content validation does not guard the editor

`npm run validate:content` (`scripts/validate-content.ts`) only scans the
markdown files under `src/content/blog`. Those files are a **backup export** of
D1, written daily by the backup job. Manual edits saved from the dashboard are
not validated.

The agent path is covered: a deterministic preflight blocks a reviewer approval
and a QC pass while hard errors remain (`src/lib/agents/preflight.ts`).

Trigger: run the same preflight in the post save API and keep the script for the
export.

## medium

### Stale UML diagrams

Several diagrams describe the original design and now contradict the code:

| File | Describes | Reality |
| --- | --- | --- |
| `UML/sequence/agent-batch-publish.md` | GitHub Actions scheduler, git store, batched build | Cloudflare cron Worker, D1, instant publish |
| `UML/class/domain-model.md` | git based content model | D1 tables plus R2 |
| `UML/deployment/production.md` | static site plus build | SSR Worker, D1, R2, second Worker |
| `UML/activity/publish-workflow.md` | commit and rebuild flow | direct D1 write |

Trigger: rewrite these next time the design is touched. Until then, treat
`UML/docs/light.md` as authoritative.

### Media alt text is only editable one image at a time

The library dialog edits alt text per image. Bulk editing and alt text
suggestions do not exist, so a large import can leave images decorative.

Trigger: add a bulk alt editor when the library passes a few hundred images.

### Category and tag URLs disagree

The category editor previews a topic URL of `/tag/<slug>/`
(`category-manager.tsx`), but `src/pages/tag/[tag].astro` filters posts by their
`tags` array, not by their `category`. A category that no post repeats as a tag
therefore has no working listing page, even though the editor implies it does.

Trigger: decide the model. Either give categories their own route
(`/category/<slug>/`) or make the tag route also match the category.

### The affiliate store is 650 lines

`src/lib/affiliate/store.ts` holds schemas, program CRUD, product CRUD, counts,
reference scanning, and report primitives. The repo guideline is roughly 300
lines per file.

Trigger: split into `schema.ts`, `products.ts`, and `references.ts` the next
time that module is opened.

### The monetization UI mirrors the affiliate URL builder

`product-form.tsx` reimplements the link preview so the user sees the URL before
saving. It mirrors the gates in `buildAffiliateUrl` (status, tracking id,
template, safe target). Two implementations of one rule drift.

Trigger: expose the preview builder from the API (already returned as
`affiliateUrl` on the list) and use that in the form instead of a local copy.

### "Run agent" is synchronous

`POST /api/dashboard/agents/[id]/run` waits for the whole DeepSeek call, which
can take up to about two minutes. A proxy or the browser can give up before the
response arrives.

Trigger: move runs to a queue and have the UI poll or subscribe.

## low

### The 503 database check is duplicated

`requireContentDatabase()` exists in `src/lib/content/database.ts`, but the
older endpoints (posts, categories, media, activity, actors) still inline their
own `resolveContentDatabase()` plus a 503 `ApiError`.

Trigger: refactor each endpoint to the helper the next time that file is opened.

### No edge caching for SSR pages

Every visitor request runs a D1 query. This is fast and it is why publishing is
instant, but it does not scale for free forever.

Trigger: when traffic grows, add a short `s-maxage` and purge on publish, and
accept that publishing then takes up to the TTL to appear.

### Categories from the seed have no `created_at`

The six seeded categories have a null `created_at`, so the dashboard shows "-"
instead of a delta for that metric.

Trigger: cosmetic. Backfill only if the metric matters.

### `worker-configuration.d.ts` is committed

It contains environment values and must be regenerated with `npm run cf:types`
after any `wrangler.jsonc` change, otherwise the types drift from reality.

Trigger: regenerate whenever bindings change.

### The agent runner reads the affiliate tables directly

`src/lib/agents/runner.ts` builds the writer's catalog slice with its own SQL
against `affiliate_products` and `affiliate_programs`, instead of going through
`src/lib/affiliate/store.ts`. It is consistent with the schema, but it is a
second reader of the same tables.

Trigger: move the catalog slice query into the affiliate store when that module
is next opened.

### Two ad slots are defined but never rendered

`in-article-mid` and `in-article-bottom` exist in `src/config/monetization.ts`
but only `in-article-top` is placed, in `PostLayout.astro`.

Trigger: place the remaining slots when an ad network is enabled.

### 429 responses carry no `Retry-After` header

`enforceRateLimit` throws a normal `ApiError`, and the error envelope sets no
custom headers, so a client cannot see how long to wait before retrying.

Trigger: extend the error envelope with optional headers the next time it is
touched.

### No image optimisation for CMS images

Article covers are served as plain `<img>` from R2 because the Astro image
pipeline only handles build time assets. No responsive `srcset`, no WebP.

Trigger: add an image transform route (Cloudflare Images, or the `/_image`
endpoint) when image weight shows up in the metrics.

### Two reviewers can dead-end a draft

The editorial reviewer can clear a draft and the strict reviewer can then request
changes on the same draft, repeatedly. Each bounce sends the draft back to the
writer for another paid revision, and once `revision_count` reaches
`MAX_REVISION_ROUNDS` the draft can never be approved, so the quota that drives
catch-up can never be met.

Current mitigation, applied without touching the agent code: `Reviewer Strict` is
disabled, so one reviewer decides, and the drafts that had already hit the limit
were archived with their topics requeued.

Trigger: give a draft a single decision. Either the strict reviewer runs as a
pre-gate before the editorial one, or it only attaches findings without
overturning an approval. Also close a draft at the revision limit, requeue its
topic, and record an activity entry so a stalled draft is visible instead of
silently burning revisions.

### Quota catch-up bypasses the per agent schedule

`runQuotaCatchUp` runs agents with `force: true`, which ignores `runs_per_day`.
With a publish target of 20 and nothing publishing, it forced up to three runs
every fifteen minutes, and one writer reached 95 runs in 36 hours.

Current mitigation: a 30 minute cooldown between catch-up passes, and the writer
is dropped from catch-up while three or more drafts are waiting for review. The
brake applies to the catch-up path only; scheduled writer runs still add drafts
while the review backlog grows.

Trigger: apply the same pending-draft brake to the scheduled writer path, and
review the publish target whenever the review loop changes.

### The legacy `category` column on agents

Migration 0022 added `categories` (a JSON array of a writer's beat) and left the
old single value `category` column in place, because the version running when the
migration applied still wrote it. Nothing reads or writes it now.

Trigger: drop it in a migration once the deployed version has been stable for a
release.

### A blocked draft waits for a human after two revisions

When QC or the reviewer sends a draft back, the writer revises it at most twice
(`MAX_REVISION_ROUNDS`). After that the draft stays `changes_requested` until
someone edits it by hand.

Trigger: none for now. The Activity page shows the blocking run and its issues.

### Rotating `AGENT_SECRET_KEY` orphans the stored secrets

AES-GCM decryption fails after rotation and the owner must re-enter the DeepSeek
key and the Pexels key. This is documented behaviour, not a bug.

Trigger: none. Just remember it.
