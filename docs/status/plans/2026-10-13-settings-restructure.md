# Settings restructure, and the Performance Analyst credentials

Recorded 2026-10-13. The owner asked for the fields that must be filled in to live in Settings, and
for the Settings page to be split into sections by purpose so the operator is not lost.

## What was wrong

Settings was a single page holding the site identity form and a read-only status card, while the
fields an operator actually has to fill in were scattered:

| Field | Where it lived |
| --- | --- |
| DeepSeek API key | The Agents page |
| Search provider key | The Agents page |
| Spending budget | The Agents page |
| Notification channels | The Notifications page |
| Ad network and affiliate disclosure | The Monetization settings page |
| Search Console, GA4, and the affiliate report | Nowhere. The Performance Analyst reported them as missing with no way to configure them |

## The new structure

`/dashboard/settings` is now a section with one page per purpose, and one shared navigation
component so the four pages cannot drift apart. The navigation takes its labels and its one-sentence
purpose from a single module, `src/lib/dashboard/settings-sections.ts`.

| Route | Purpose | Holds |
| --- | --- | --- |
| `/dashboard/settings` | The site's identity | The site title, description, and social defaults, plus the read-only integrations and backup status |
| `/dashboard/settings/providers` | Keys and spend limits for the services the agents call | The DeepSeek key, the search provider, and the spending budget, moved off the Agents page |
| `/dashboard/settings/performance` | The Performance Analyst's data sources and schedule | Search Console, GA4, the affiliate report import, the connection test, the schedule, and the threshold config |
| `/dashboard/settings/notifications` | Where alerts are delivered | The email and Telegram channels and the per-event switches, moved off the Notifications page |

The Agents page and the Notifications feed keep a short line saying where the settings moved, with
a link, so an existing bookmark or habit does not dead-end.

The Settings navigation marks the current section with `aria-current="page"` and a weight and
underline change, not colour alone.

## The new fields

`/dashboard/settings/performance` is the page that was missing. It carries:

- **Search Console.** The service account JSON pasted into a text area, plus the property, which
  accepts either a URL prefix such as `https://lightscripts.com/` or a `sc-domain:` property.
- **GA4.** The service account JSON plus the numeric property id.
- **The service account email**, shown in a copyable form once a credential is stored, because that
  email has to be granted read access in the Google console. This is the only part of a service
  account that is safe to display.
- **Numbered setup steps**, specific to each API, in plain language, for an operator who has never
  created a service account.
- **A connection test per source**, which makes the smallest real API call the client supports, and
  which reports the outcome without discarding what was typed.
- **The affiliate report import.** Amazon reports no order to this site, so the operator downloads
  the order report from Associates Central by hand and pastes it. The result names how many lines
  were imported and how many could not be matched to a product.

Security choices, all tested: the private key is encrypted at rest with the same AES-GCM helper the
DeepSeek key uses, it is never returned to the browser, and a saved credential is shown only as a
masked hint. Validation rejects a JSON file that is not a service account and names the missing or
malformed field, without calling Google.

## What activates once the fields are filled

| Source | Effect |
| --- | --- |
| Search Console | Activates the `title_meta` rule (high impressions, low click-through) and the `refresh` rule (position 5 to 15), and the `new_topic` rule for a query with no page. A `refresh` finding suppresses the `title_meta` finding for the same post, so one page never queues twice |
| GA4 | A page-view cross-check against the first-party view table. GA4 has no impressions, click-through, or position, so it is never presented as a source for those |
| Affiliate report | Activates the zero-commission variant of the product rule, but only when a report actually covers the analysis window. A missing or stale report can never be read as zero commission |

## Honesty and safety rules held throughout

- Google credential failures are recorded against that source and never abort the run. Only the
  first-party database sources can abort it.
- Unmatched report lines are kept with no product and counted, never dropped.
- The report ledger is append-only, because Amazon revises figures and reports returns. Only an
  identical observation is deduplicated.
- The word revenue does not appear in the new copy, and no commission number is claimed anywhere.
- A source that is not usable is never rendered as healthy.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors, 0 warnings, 2 pre-existing hints |
| `npm run lint` | Clean across 397 files |
| `npm test` | 93 files, 1083 tests passed |
| `npm run build` | Complete |
| Migration `0028_affiliate_report.sql` | Applied to remote D1 |
| Deploy | Version `9bbf90da-b8eb-4d5a-a4f2-7d8ce6a1804f` |

The Google clients and the report parser are verified against stubbed HTTP responses, covering
success, pagination, a row cap, 401 without a retry, 429 with `Retry-After`, 5xx with a retry, an
abort to a timeout, both decimal formats, header alias variants, and every source-account rejection.

**What that does not prove.** No Google credential exists in this environment, so a real OAuth
exchange, a real Search Console or GA4 response shape, and a real Amazon export have not been
exercised. The dashboard routes sit behind Cloudflare Access, so the four settings pages were not
opened in a browser either; they are covered by `astro check` and by server-render assertions in
`performance-settings-rendering.test.ts` instead. Both limits are stated rather than papered over.

## Two defects found and fixed during this work

1. The remediation text stored for the three unconfigured sources still described the credential
   storage and the report import as unbuilt, and used the word revenue. It is operator-facing copy
   that renders verbatim in the status list, so it was corrected, and the test that locked the old
   wording was updated with it.
2. The source status list rendered twice on the performance page, once from the credentials card and
   once from the schedule card. The credentials card now points to the single list rather than
   repeating it, because a duplicated list on the page the operator is meant to use is exactly the
   confusion this restructure was meant to remove.

## Still open

- The owner decision on `ascsubtag`. Without a per-page sub-id in the Amazon link, an imported
  report cannot be attributed to a page or a product, so the commission rule can only ever evaluate
  a whole-site total. Every week of clicks without it is data that cannot be recovered.
- The shared `readJsonBody` helper reads the whole body before checking the size cap. The admin-only
  routes and the route-level limits bound the exposure, but the helper is worth fixing properly.
- Thresholds remain editable from both the analyst page and the settings page, both writing the same
  API. That is deliberate for now, because the analyst page is where the queue is read.
