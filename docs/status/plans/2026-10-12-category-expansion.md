# Category expansion and the writer beats

Decision recorded 2026-10-12, applied to production the same day. This documents the
new category set, the writer that owns each one, and the exact database changes, so
the taxonomy can be re-derived or rolled back deliberately.

## Why

The catalogue had seven categories and only two writers. Two writers can own at most
twelve categories between them (`MAX_AGENT_CATEGORIES` is 6 per writer), so the
catalogue had almost no room to grow, and the categories a home-office buyer asks
about most were not covered at all: laptops, displays lighting, storage, networking,
printers, tablets, and video-call gear.

The planner only proposes topics in the union of the enabled writers' beats, so a
category without an owner is a category that never gets written. Conversely, a
category with an owner but no queued topic is not idle, because the writer falls back
to any category when its own beat is empty.

The bottleneck recorded in the roster plan still holds: supply and specialisation
before volume. This change is about supply, not throughput. No existing run cadence
was changed.

## Category set

Fifteen categories, each owned by exactly one writer.

| Category | Label | Posts before | Owner |
| --- | --- | --- | --- |
| monitors | Monitors | 5 | Writer A |
| desk-setup | Desk Setup | 16 | Writer A |
| accessories | Accessories | 9 | Writer A |
| standing-desks | Standing Desks | 0 | Writer A |
| lighting | Lighting | 0 | Writer A |
| chairs | Chairs | 4 | Writer B |
| keyboards | Keyboards | 2 | Writer B |
| audio | Audio | 3 | Writer B |
| meeting-gear | Meeting Gear | 0 | Writer B |
| buying-basics | Buying Basics | 3 | Writer B |
| laptops | Laptops | 0 | Writer C |
| tablets | Tablets | 0 | Writer C |
| data-storage | Data Storage | 0 | Writer C |
| networking | Networking | 0 | Writer C |
| printers | Printers & Scanners | 0 | Writer C |

Nine of these are new rows. `accessories` was the important one: writer beats and
nine published posts already referenced it, but the row itself was missing, so the
category had no label in the dashboard and no entry in the picker.

## Two naming decisions

- **`data-storage`, not `storage`.** The curated copy for `storage` describes
  under-desk drawers and trays, and one published post is tagged that way. Reusing the
  slug for SSDs and backup would have made the tag page describe the wrong thing, so
  data storage gets its own slug.
- **`laptops` was rewritten.** Its curated copy described laptop stands and risers,
  which belongs to `desk-setup` and `accessories`. No published post was tagged
  `laptops`, so the slug was free to mean laptop buying instead.

## Writer beats

| Writer | Beat | Why this grouping |
| --- | --- | --- |
| A | desk-setup, monitors, accessories, standing-desks, lighting | The desk surface, what sits on it, and what you look at |
| B | chairs, keyboards, audio, meeting-gear, buying-basics | Sitting, typing, listening, and being seen on a call |
| C | laptops, tablets, data-storage, networking, printers | The computer and everything connected to it |

Writer C is new. It exists because fifteen categories do not fit in two writers: the
six-category cap would be exceeded. It is configured at 3 runs per day to match the
other two writers, not the 24 in the original roster plan, because the owner reduced
every cadence after that plan was recorded.

## Database changes

Applied with `wrangler d1 execute light-content --remote --file`. Both writer updates
are scoped by agent id, the category inserts are idempotent through
`ON CONFLICT(slug) DO UPDATE`, and the new agent is guarded by a
`WHERE NOT EXISTS` on its id, so the script can be re-run safely.

```sql
INSERT INTO categories (slug, label, description) VALUES
  ('accessories', 'Accessories', 'Desk organisers, trays, stands, and the small parts that earn their place.'),
  ('standing-desks', 'Standing Desks', 'Standing desks and converters, and the height range that actually fits you.'),
  ('lighting', 'Lighting', 'Desk lamps and monitor light bars that are kind to your eyes.'),
  ('laptops', 'Laptops', 'Work laptops, and the thermal, battery, and port trade-offs that show up later.'),
  ('tablets', 'Tablets', 'Tablets and e-readers for reading, notes, and a second screen.'),
  ('data-storage', 'Data Storage', 'SSDs, external drives, and backup that survives a bad day.'),
  ('networking', 'Networking', 'Routers and mesh systems that hold up when the whole house is online.'),
  ('printers', 'Printers & Scanners', 'Printers that are cheap to run, not just cheap to buy.'),
  ('meeting-gear', 'Meeting Gear', 'Webcams, call lighting, and the setup for looking right on video calls.')
ON CONFLICT(slug) DO UPDATE SET label = excluded.label, description = excluded.description;

UPDATE agents SET
  categories = '["desk-setup","monitors","accessories","standing-desks","lighting"]',
  prompt = '<beat description in the agents table>',
  updated_at = '2026-10-12T14:07:48.000Z'
WHERE id = 'agent-writer-a';

UPDATE agents SET
  categories = '["chairs","keyboards","audio","meeting-gear","buying-basics"]',
  prompt = '<beat description in the agents table>',
  updated_at = '2026-10-12T14:07:48.000Z'
WHERE id = 'agent-writer-b';

INSERT INTO agents (id, name, role, prompt, categories, model, runs_per_day, enabled,
  auto_publish, last_run_at, next_run_at, created_at, updated_at)
SELECT 'agent-writer-c', 'Writer C', 'writer', '<beat description>',
  '["laptops","tablets","data-storage","networking","printers"]',
  'deepseek-flash', 3, 1, 0, NULL,
  '2026-10-12T14:07:48.000Z', '2026-10-12T14:07:48.000Z', '2026-10-12T14:07:48.000Z'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE id = 'agent-writer-c');
```

The raw updates deliberately do not touch `next_run_at`, so editing a beat does not
disturb the schedule. Writer C is created due immediately, which is what the agent
form does for a new enabled agent.

## Code kept in step

Three places hold the category catalogue, and all three now list the same fifteen:

- `migrations/` and the `categories` table, which the dashboard and the public tag
  pages read at runtime.
- `src/data/categories.json`, the seed source.
- `src/consts.ts` `TOPICS`, the fallback used when no database is bound.

`src/lib/content/topics.ts` gained curated labels and tag-page copy for
`standing-desks`, `tablets`, `data-storage`, `networking`, `printers`, and
`meeting-gear`, and its `laptops` copy was rewritten. Without that the tag pages fall
back to a prettified slug and a generated intro.

## Rollback

```sql
UPDATE agents SET categories = '["desk-setup","monitors","accessories"]' WHERE id = 'agent-writer-a';
UPDATE agents SET categories = '["chairs","buying-basics","keyboards","audio"]' WHERE id = 'agent-writer-b';
UPDATE agents SET enabled = 0 WHERE id = 'agent-writer-c';
DELETE FROM categories WHERE slug IN ('standing-desks','lighting','laptops','tablets','data-storage','networking','printers','meeting-gear');
```

Turning Writer C off rather than deleting it keeps its run history. Categories are
only deleted if they still hold no posts.

## Known loose ends

- `stargazer` is a category with a lowercase label and no posts. It looks like an
  accidental creation and is inert, because no writer beat references it. It was left
  in place rather than deleted without the owner asking.
- `topics` holds two queued topics in `accessories` and one in `buying-basics` that
  predate this change, so the new beats give them an owner immediately.
- Breadth dilutes: the search budget allows roughly twelve researched topics a day, now
  spread across fifteen categories instead of seven. If a category stays empty for
  weeks, the honest fix is to remove its owner rather than to raise the planner cadence.
