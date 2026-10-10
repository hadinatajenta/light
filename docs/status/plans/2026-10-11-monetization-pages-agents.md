# Plan: monetization menu, pages CRUD, and the first agents

Status: **waiting for review**. No code has been written for this plan yet.

Date: 2026-10-11

Three workstreams:

- [A. Monetization menu and the affiliate catalog UI](#a-monetization-menu-and-the-affiliate-catalog-ui)
- [B. The first agents: 2 writers and 1 reviewer](#b-the-first-agents-2-writers-and-1-reviewer)
- [C. Pages menu with CRUD](#c-pages-menu-with-crud)

Decisions needed from you are collected at the end.

---

## A. Monetization menu and the affiliate catalog UI

### A1. What exists already

- Tables `affiliate_programs` and `affiliate_products` (migration `0004`).
- Amazon program seeded with tracking id `lightscripts-20`, status approved.
- `product:<slug>` references are rewritten into real affiliate URLs at render
  time, with `rel="sponsored nofollow noopener"` and `target="_blank"`.
- The affiliate disclosure renders automatically when a post contains affiliate
  links.

What is missing: **no UI**. Products must be inserted with SQL today, so you
cannot run the business without me.

### A2. Menu structure

Three sub-pages under one sidebar item:

| Route | Contents |
| --- | --- |
| `/dashboard/monetization` | **Programs**: list, add, edit, pause, delete |
| `/dashboard/monetization/catalog` | **Products**: table, search, add, edit, delete, bulk import, broken reference report |
| `/dashboard/monetization/settings` | **Ads** (network, client id, slot ids, ads.txt) and **Disclosure** (global text) |

### A3. Schema additions (migration `0005_monetization.sql`)

```sql
ALTER TABLE affiliate_products ADD COLUMN topics TEXT NOT NULL DEFAULT '[]';
ALTER TABLE affiliate_products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_affiliate_products_active ON affiliate_products (is_active);
```

Two new rows in the existing `settings` table:

- `ads_config` (JSON): `{ network, adsenseClientId, slots, adsTxt }`
- `affiliate_disclosure` (text): the global fallback disclosure

`src/config/monetization.ts` stays as the default when a settings row is absent,
so nothing breaks if the row is missing.

### A4. API contract

All routes are admin-only, all writes are recorded in the activity log.

| Method and path | Body | Response |
| --- | --- | --- |
| `GET /api/dashboard/monetization/programs` | - | `{ programs: Program[] }` where each program carries `productCount` |
| `POST /api/dashboard/monetization/programs` | `{ id, name, network, trackingId, linkTemplate, status, disclosure }` | `201 { program }` |
| `PUT /api/dashboard/monetization/programs/[id]` | same | `{ program }` |
| `DELETE /api/dashboard/monetization/programs/[id]` | - | `{ id, deleted: true }`, `409 PROGRAM_IN_USE` when products reference it |
| `GET /api/dashboard/monetization/products` | query `q`, `program`, `active`, `page`, `per_page` | `{ products, total, page, per_page, total_pages }` |
| `POST /api/dashboard/monetization/products` | `{ slug, name, programId, target, priceAmount, priceCurrency, imageUrl, topics, notes, isActive }` | `201 { product }`, `409 SLUG_TAKEN` |
| `PUT /api/dashboard/monetization/products/[id]` | same | `{ product }` |
| `DELETE /api/dashboard/monetization/products/[id]` | - | `{ id, deleted: true }` |
| `POST /api/dashboard/monetization/products/import` | `{ programId, lines }` | `{ created, skipped, errors }` |
| `GET /api/dashboard/monetization/settings` | - | `{ ads, disclosure }` |
| `PUT /api/dashboard/monetization/settings` | `{ ads, disclosure }` | `{ ads, disclosure }` |

Validation rules:

- `slug`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 60, unique.
- `target`: must match the safe URL pattern already used by
  `buildAffiliateUrl`. For an Amazon program, a 10 character ASIN is expected; a
  different shape produces a **warning**, not a hard failure, because some
  networks need a full URL.
- `linkTemplate` must contain `{target}` and `{trackingId}` or be empty.
- `priceAmount` and `priceCurrency` are optional, but if one is set the other is
  required.

### A5. Product form behaviour

Fields: slug (auto-filled from the name until you edit it), name, program,
target, price, currency, image URL, topics, notes, active.

Two things that make this safe to use:

1. **Live link preview.** The form shows the exact URL that will be emitted,
   built server-side with the same function the renderer uses. No guessing.
2. **Reference check.** When you edit or delete a product, the API reports how
   many published posts reference `product:<slug>`. Deleting a referenced
   product warns first.

### A6. Bulk import

A dialog with a textarea. Each line is one product:

```
slug | name | target
```

or, for Amazon, just an ASIN list when a default name can be derived. The import
returns created, skipped (duplicate slug), and error rows, and never fails the
whole batch because of one bad line.

### A7. Broken reference report

A small panel on the catalog page: it scans published post bodies for
`product:<slug>` references that no longer resolve, and lists the post and the
missing slug. This is the safety net that keeps dead links from shipping.

### A8. Ads and disclosure settings

- Network: `none`, `adsense`, `ezoic`, `mediavine`.
- Client id and per-slot ids. Slots already exist in the layout:
  `in-article-top`, `in-article-mid`, `in-article-bottom`.
- `ads.txt` content, served at `/ads.txt`. Today it is a static placeholder
  file; the plan is to serve it from settings so you can paste the real line.
- Global disclosure text, with a note that Amazon requires its exact sentence
  and that the program level override wins.

### A9. Verification for part A

- Unit tests: slug validation, import line parsing, template validation.
- Local end to end: create a program, create a product, reference it in a post,
  confirm the rendered page carries the tracking id, `rel="sponsored"`, and the
  disclosure.
- Confirm the existing tests still pass and the build is clean.

---

## B. The first agents: 2 writers and 1 reviewer

### B1. The problem with 24 runs per day

A writer's topic currently comes from its prompt, which is fixed. At 24 runs per
day, one writer would produce 24 drafts about the **same topic**, and two
writers would produce 48. That is worse than producing nothing, because it fills
the review queue with near duplicates and burns tokens.

So the writer needs a **topic queue** before it can run on a schedule.

### B2. Topic queue (new, required)

Migration `0006_topics.sql`:

```sql
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  assigned_agent_id TEXT,
  used_post_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics (status, created_at);
```

Writer run behaviour:

1. Claim the oldest `queued` topic and mark it `in_progress`.
2. Generate the draft from that topic.
3. On success, mark the topic `used` and store the produced post id.
4. On failure, return the topic to `queued` so it is retried, and record the
   failure in the run.

If the queue is empty, the writer exits immediately with
"No topic queued" instead of inventing one. That is what makes 24 runs per day
safe.

Management: a small `/dashboard/agents/topics` screen (list, add one, bulk add
by pasting lines, delete, re-queue). Without it, the queue can only be filled
with SQL.

### B3. Writer and reviewer wiring to the catalog

- The writer prompt gains the catalog slice: the products whose `topics` match
  the topic's category, plus their slugs and names.
- The writer must reference products as `[name](product:<slug>)` and is told
  never to write a URL.
- The QC role gains a check: fail a draft that references a slug which is not in
  the catalog.

This is the step that makes agent output **monetisable**, so it belongs in the
same delivery as the catalog.

### B4. The agents to create

| Name | Role | Model | Runs per day | Auto publish | Prompt focus |
| --- | --- | --- | --- | --- | --- |
| Writer A | writer | deepseek-flash | 24 | no | Monitors, desk setup, chairs |
| Writer B | writer | deepseek-flash | 24 | no | Keyboards, audio, accessories |
| Reviewer | reviewer | deepseek-flash | 24 | **yes** | Strict editor, checks facts and structure |

Splitting the two writers by sub-niche is deliberate: it reduces overlap while
the topic queue is still small.

The reviewer has auto publish on, which is the behaviour you approved: a draft
becomes published only when the reviewer approves it.

### B5. Two blockers before they should be enabled

1. **The DeepSeek API key is not saved yet.** Every run would fail.
2. **The topic queue is empty.** Every run would exit with "No topic queued".

Plan: create the three agents with `enabled = 0`, at 24 runs per day as
requested, and enable them after the key is saved and the queue has topics. One
click each. I will not enable them early, because 48 duplicate drafts per day is
a real cost.

### B6. Verification for part B

- Unit tests: topic claiming (oldest first, status transitions), empty queue
  behaviour.
- Local: add 2 topics, run Writer A twice, confirm two distinct drafts and that
  both topics are marked used.
- Confirm a run with an empty queue exits without calling DeepSeek.

---

## C. Pages menu with CRUD

### C1. Current state

`about`, `contact`, `privacy-policy`, `cookie-policy`, `terms`, and
`affiliate-disclosure` are static `.astro` files with hand written markup. They
cannot be edited without a deploy.

### C2. Target

The same six pages become rows in a `pages` table, editable in the dashboard,
rendered from D1 with the same look as a post.

### C3. Schema (migration `0006` or `0007`)

```sql
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  seo_title TEXT,
  canonical TEXT,
  noindex INTEGER NOT NULL DEFAULT 0,
  show_in_footer INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`id` is the slug, so `/about/` keeps working.

### C4. Public route

A new root route `src/pages/[slug].astro`:

1. Look up the page by slug in D1.
2. If missing, or the status is `draft`, return 404.
3. Otherwise render with `PageLayout`.

Astro resolves static routes before dynamic ones, so `/blog/`, `/tag/...`, and
`/dashboard/...` are unaffected. The six static `.astro` files are deleted in
the same change so there is one source of truth.

### C5. Look and feel

`PageLayout.astro` reuses the post typography and container: same heading scale,
same `.post-body` prose styles, same standfirst, same width. It deliberately
drops the parts that only make sense for an article: no table of contents, no
reading time, no byline, no tags, no affiliate disclosure, no ad rail.

### C6. Admin

| Route | Contents |
| --- | --- |
| `/dashboard/pages` | Table: title, slug, status, footer flag, updated. Actions: edit, delete. |
| `/dashboard/pages/new` | Form |
| `/dashboard/pages/[id]/edit` | Same form, plus the live URL and a preview link |

The form reuses the MDXEditor setup from the post editor, plus a slim SEO block
(title, description, slug, canonical, noindex). No category, no tags, no
publish workflow beyond draft and published.

### C7. Seeding the existing content

A one time script converts the six current pages into markdown and inserts them,
so nothing is lost and the legal text keeps its wording. You should review the
legal text afterwards, because I am not a lawyer and the current text is
placeholder grade.

### C8. Footer links

Today the footer hard codes the legal links. The plan is to drive the "Legal"
group from `pages` where `show_in_footer = 1`, so adding a page adds its link.
If you prefer, we keep the footer hard coded and the flag is ignored.

### C9. Verification for part C

- Local: edit a page, confirm the public URL reflects it immediately (no
  rebuild).
- Confirm `/about/`, `/terms/`, `/privacy-policy/`, `/cookie-policy/`,
  `/contact/`, and `/affiliate-disclosure/` all still return 200 after the
  static files are removed.
- Confirm an unknown slug still returns 404.

---

## Suggested order and rough size

| Step | Work | Why this order |
| --- | --- | --- |
| 1 | Catalog UI plus Monetization menu (part A) | Without it you cannot manage products, and the agents have nothing to reference |
| 2 | Topic queue plus writer and reviewer wiring, then create the three agents (part B) | Makes agent output monetisable and safe to schedule |
| 3 | Pages CRUD (part C) | Independent, and it removes six hand written files |

Part A and part C are independent and could be built in either order. Part B
depends on part A.

## Decisions needed from you

1. **Menu shape for monetization**: three sub-pages as proposed, or one long page
   with sections?
2. **Agents**: agree to create the three agents **disabled**, at 24 runs per day,
   and enable them only after the DeepSeek key is saved and the topic queue has
   topics? Or enable them immediately?
3. **Reviewer auto publish**: keep it **on**, so an approved draft publishes
   itself? Or should the reviewer only approve, and you press publish?
4. **Footer links**: drive the legal links from the pages table, or keep them
   hard coded?
5. **Legal text**: do you want to write the privacy policy and terms yourself,
   or should I draft them for you to review?
6. **Scope check**: do you want all three parts in one delivery, or part A first
   so you can start using the catalog sooner?
