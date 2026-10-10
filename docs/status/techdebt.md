# techdebt.md - known debt and shortcuts

Shortcuts taken on purpose, with the reason and the trigger that should make us
pay them back. Nothing here is a surprise bug; each item is a conscious trade.

Severity: **high** (fix soon, real risk), **medium** (fix when the trigger
fires), **low** (accept for now).

---

## high

### Content validation no longer guards what is published

`npm run validate:content` (`scripts/validate-content.ts`) only scans the
markdown files under `src/content/blog`. Those files are now a **backup export**
of D1, written daily by the backup job. The real, published content lives in
`posts.body` in D1 and is never validated.

So the gate that checks word count, description length, and placeholder text
does not run against anything a visitor actually reads.

Trigger: add validation on the write path (the post save API) and keep the
script for the export.

### Agent runs are not locked against overlapping ticks

`runAgent` writes `next_run_at` only **after** the run finishes
(`markAgentRun`). If a cron tick fires while a run is still going (or two ticks
overlap because a run took longer than 15 minutes), the same agent can be picked
up twice and run twice, spending tokens twice.

Trigger: claim the agent before running it (move `next_run_at` forward at claim
time) or add a run lock with a heartbeat.

## medium

### Article HTML is rendered without sanitisation

`src/lib/content/public.ts` renders `posts.body` with `marked` and the result is
injected with `<Fragment set:html>` in `src/layouts/PostLayout.astro`. Raw HTML
inside markdown is passed through. Today the only authors are the owner and the
agents, and agents produce drafts that a reviewer approves, so the blast radius
is small. It is still an injection path.

Trigger: sanitise before render (an allowlist of tags), or strip raw HTML at
render time. Do it before any untrusted author is added.

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

### Media alt text cannot be edited

`createR2MediaStore` stores `alt: ''` and there is no UI to change it, so every
image is decorative as far as assistive tech and image search are concerned.

Trigger: add an alt field to the media library and let the editor set it.

### The affiliate disclosure never renders

`src/layouts/PostLayout.astro` shows `DEFAULT_AFFILIATE_DISCLOSURE` only when
`post.affiliate === true`, but `src/components/dashboard/post-editor.tsx` hard
codes `affiliate: false` on save. So a post with affiliate links shows no
disclosure, which is a program compliance problem, not just a UI gap.

Trigger: add the toggle to the editor and the SEO panel, and set the field on
save.

### Category and tag URLs disagree

The category editor previews a topic URL of `/tag/<slug>/`
(`category-manager.tsx`), but `src/pages/tag/[tag].astro` filters posts by their
`tags` array, not by their `category`. A category that no post repeats as a tag
therefore has no working listing page, even though the editor implies it does.

Trigger: decide the model. Either give categories their own route
(`/category/<slug>/`) or make the tag route also match the category.

### The media library has no UI

The Media page is a placeholder. The API (`/api/dashboard/media`) and the R2
storage work, but the only way to upload is the image button inside the post
editor, and there is no grid, no delete, and no alt text.

Trigger: build the media library page. Until then, treat media as
"API only".

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

### Unbounded growth of `activity` and `agent_runs`

Neither table is pruned. At the current rate this is negligible.

Trigger: add a retention job when the tables pass roughly 100k rows.

### `worker-configuration.d.ts` is committed

It contains environment values and must be regenerated with `npm run cf:types`
after any `wrangler.jsonc` change, otherwise the types drift from reality.

Trigger: regenerate whenever bindings change.

### Scrapper output has no home

Research notes produced by the scrapper role are stored only inside the
`agent_runs.output` text blob. There is no `sources` table, so the writer cannot
consume them automatically.

Trigger: build a `sources` table when the scrapper to writer handoff is wired.

### Two ad slots are defined but never rendered

`in-article-mid` and `in-article-bottom` exist in `src/config/monetization.ts`
but only `in-article-top` is placed, in `PostLayout.astro`.

Trigger: place the remaining slots when an ad network is enabled.

### The root README is stale

`README.md` still describes a static site and tells you to replace
`https://example.com`, but `astro.config.mjs` already points at
`https://lightscripts.com` and the site is SSR on D1 and R2.

Trigger: refresh it the next time onboarding docs are touched. Until then,
`UML/docs/light.md` is authoritative.

### No image optimisation for CMS images

Article covers are served as plain `<img>` from R2 because the Astro image
pipeline only handles build time assets. No responsive `srcset`, no WebP.

Trigger: add an image transform route (Cloudflare Images, or the `/_image`
endpoint) when image weight shows up in the metrics.

### No rate limiting on the admin API

Cloudflare Access is the only gate. There is a single admin today.

Trigger: add per-token limits if more editors are added or the API is exposed.

### Rotating `AGENT_SECRET_KEY` orphans the stored DeepSeek key

AES-GCM decryption fails after rotation and the owner must re-enter the key.
This is documented behaviour, not a bug.

Trigger: none. Just remember it.
