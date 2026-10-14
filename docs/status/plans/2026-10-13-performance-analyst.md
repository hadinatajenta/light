# Performance Analyst agent

Decision recorded 2026-10-13. This documents the engine, the storage, the cron
integration, and the protected lifecycle of a non-LLM agent that turns the
site's own analytics into an evidence-backed work queue.

## Why

The site carries roughly six views a day and a few dozen clicks in total. At
that scale the highest-value work is not more content, it is making the
existing traffic earn: posts with views and no product links, product
references that cannot resolve, clicks that cannot pay out, and go links that
lead nowhere. The analyst finds those from D1 only, spends no tokens, and
cannot be deleted.

## What ships

- New role `analyst` with `usesModel: false`, `systemManaged: true`, and
  `canAutoPublish: false`. It is not in `AGENT_ROLE_ORDER`, so the "Run
  pipeline" rounds skip it, and `sortAgentsByRoleOrder` sorts it last in the
  due list.
- Migration `0027_performance_analyst.sql`: `agents.schedule_mode`,
  `agents.system_managed`, the seeded analyst row, delete and update triggers,
  the partial unique index, `analyst_findings`, and `analyst_source_status`.
- Schedule modes `manual`, `daily`, `weekly` with `computeAgentNextRunAt`.
- Five rule families that work from D1 today, a weekly runner, source status
  rows, and the planner pointer plumbing for the future `new_topic` rule.
- A reconciler that runs at the start of `run-due.ts`.

## The three structural defects and their fixes

### 1. The budget gate and the model key ran before any role branch

Before: `executeAgentRun` read the budget state and called `requireDeepseekKey`
before it looked at the role. A non-LLM role would be skipped while the budget
was paused, or fail with `DEEPSEEK_KEY_MISSING`, even though it spends nothing.
A role that matched no branch fell through to the empty-message path and was
recorded as succeeded.

After: `resolveAgentRunBranch` runs first and throws
`UNKNOWN_AGENT_ROLE` (500) for any role without a branch. The analyst branch
runs before the budget gate and before the model key. The key requirement
stays on the model path, after the analyst returns. A second terminal check
before the shared writer and review tail guarantees that a future branch value
without an implementation cannot report success. `AGENT_RUN_BRANCHES` is typed
`Record<AgentRole, AgentRunBranch>`, so adding a role to `AGENT_ROLES` without
wiring a branch fails the type check, and `branches.test.ts` iterates
`AGENT_ROLES` at runtime and asserts every role resolves to a branch.

### 2. `runs_per_day` could not express weekly or manual

Before: `runs_per_day` was clamped to 1..96 and every schedule was an interval
inside a day. `next_run_at IS NULL` meant due, so a manual agent would run every
fifteen minutes.

After: `agents.schedule_mode` is `manual`, `daily`, or `weekly`.
`computeAgentNextRunAt(agent, from)` returns `null` for manual, seven days for
weekly, and the existing runs-per-day interval for daily. `listDueAgents` and
the non-forced branch of `claimAgentRun` both exclude `schedule_mode =
'manual'`, so a manual agent is only ever run by an explicit force.
`updateAgent` preserves the existing `next_run_at` for a system agent unless
its schedule mode actually changed; a normal agent keeps the previous behavior
of recomputing from now on every edit. `markAgentRun` takes the agent record
and writes the next run from the new function, so a weekly agent moves a week
out after each run and a manual agent keeps a null clock. `createAgent` still
makes a new scheduled agent due on the next tick and a manual agent never due.

The migration cannot call `computeNextRunAt`: it is JavaScript, not SQL. So the
seeded analyst gets `next_run_at` equal to its creation timestamp, which makes
it due on the next cron tick, and the weekly cadence starts from its first
completed run.

### 3. `finishAgentRun` could overwrite the reaper

Before: the UPDATE had no status guard, so a run that finished after the reaper
closed it overwrote the reaper's `failed` with `succeeded`.

After: `finishAgentRun` updates only `WHERE id = ? AND status = 'running'`, and
the reaper only closes rows that are still `running`. Whichever writes first
wins, and the reaper's closure is terminal.

## Thresholds and their reasoning

The site has roughly six views a day, so 28 complete days is about 168 views in
the window. Thresholds are settings-backed through `readAnalystConfig` and
`saveAnalystConfig`, following the budget settings pattern.

| Rule | Threshold | Default | Reasoning |
| --- | --- | --- | --- |
| `no_affiliate_link` | minimum views | `max(3, ceil(0.02 * total window views))` | A post must carry at least a measurable slice of the site's own traffic. At 168 views that is 4 views. The floor of 3 stops a brand new site from reporting noise. The cap of 3 findings per run then ranks the survivors by expected clicks, so a slightly low floor cannot flood the queue. |
| `dead_target` | none beyond existence | n/a | A published product reference that cannot resolve is a defect at any traffic level. Volume is controlled by the cap and by ranking on the affected post's views. |
| `broken_placement` | minimum clicks | 1 | One click is already a lost click. Zero-click products are not actionable yet. |
| `redirect_misses` | minimum 404s | 2 | A single miss is often a bot or a one-off. Two or more from the same slug is a link real readers follow. |
| `zero_views` | minimum age | 30 days | The article has had a month to be indexed and linked. Anything younger is still normal. |
| `zero_views` | maximum findings | 1 | The rule is the lowest priority and must never crowd out the money rules. |

Every rule is capped at 3 findings per run (the zero views rule at 1). The cap
is applied after ranking, and every present candidate key (capped or not) is
still passed to the persistence step so an uncapped finding does not count as
"missing" and cannot expire by accident.

The score is deterministic and reproducible from the stored evidence:
`round(impact(clamped 0..3) * confidence(clamped 0..1) * effortFactor * (1 +
min(prizeClicks, 10)) * 10)`, where the effort factors are S 1.2, M 1, and L
0.8. The evidence payload stores the raw numbers, the threshold values that
were used, `expectedClickRate`, and `prizeClicks`, so any score can be
recomputed from the row.

## Rule inventory

| Rule | Subject | Action | Effort | Finding key |
| --- | --- | --- | --- | --- |
| `no_affiliate_link` | post | add_links | M | post id |
| `dead_target` | post (the reference) | swap_product | S | `postId:slug` |
| `broken_placement` | product | investigate | M | slug |
| `redirect_misses` | redirect | investigate | S | slug |
| `zero_views` | post | investigate | M | post id |
| `new_topic` | dormant | n/a | n/a | n/a |

`dead_target` reuses `extractProductSlugs` from the affiliate store and
`buildAffiliateUrl` from the affiliate links module, so the rule and the
runtime agree on what resolves. It reports a missing product row, an inactive
product, a missing program, a program that is not approved, an empty tracking
id, or a link that cannot build a URL.

## Deletion and protection matrix

Supported paths:

| Path | Result |
| --- | --- |
| `createAgent` with role `analyst` | 409 `AGENT_PROTECTED`, the role is system managed |
| `deleteAgent` on the analyst | 409 `AGENT_PROTECTED`, tells the operator to switch it to manual instead |
| `updateAgent` changing the role | 409 `AGENT_PROTECTED` |
| `updateAgent` disabling it | 409 `AGENT_PROTECTED` |
| `setAgentEnabled(false)` | 409 `AGENT_PROTECTED` |
| SQL `DELETE` of a system row | trigger aborts |
| SQL `UPDATE` that flips `system_managed` or `role` away | trigger aborts |
| A second system-managed analyst row | partial unique index rejects it |

For a system agent, `updateAgent` only applies `name`, `prompt`, and
`scheduleMode`; model, autoPublish, categories, enabled, and runsPerDay are
preserved. Setting the schedule to `manual` is the supported way to stop it
without deleting it.

Honest statement of what is not covered:

- An operator with direct database access can drop the triggers, drop the
  partial index, or replace the row with a normal agent that holds the same id.
  The reconciler runs at the start of every cron tick, so a missing analyst row
  is recreated with the fixed id and an activity entry within fifteen minutes,
  but a deletion can stay effective for up to one tick.
- The reconciler repairs the fixed id when it exists with role `analyst` but
  `system_managed = 0`. If the fixed id is held by a row with a different role,
  the reconciler records an `agent.reconcile_conflict` activity entry and does
  not recreate, because the insert would fail on the primary key.
- A raw SQL insert of an analyst row with `system_managed = 0` and a different
  id is outside the protected path. The partial unique index only constrains
  system-managed rows.
- The triggers only apply to the `agents` table. Nothing stops a direct SQL
  delete of the analyst's findings or runs.

## Sources

| Source | Status today | Notes |
| --- | --- | --- |
| `clicks` | ok | Click totals per product in the window, the product catalog joined to programs, and redirect misses from `listRecentRedirectMisses` (capped at its 50-row scan). |
| `post_views` | ok | Published posts and their window and baseline view totals. |
| `gsc` | missing | No credential and no import path. The remediation string names the service account, the Search Console property access, and the import to build. |
| `ga4` | missing | No credential and no import path. The remediation string names the Analytics Data API service account, Viewer on the property, and the import to build. |
| `affiliate_report` | missing | No credential and no import path. The remediation string names the scheduled network report import and the columns it needs. |

A missing source never throws and never contributes fake numbers. A hard read
failure in `clicks` or `post_views` is recorded as an `error` source status and
aborts the run with `ANALYST_SOURCE_FAILED`, before any finding is written or
expired. Missing data must not look like a resolution.

## Queue semantics

Findings are unique on `(rule_id, finding_key)`. A recurring finding refreshes
`last_seen_at`, `seen_count`, `evidence`, `score`, and the window fields
instead of inserting a duplicate. A finding that does not appear in three
consecutive runs becomes `expired`. A post-subject finding whose post was
updated after `last_seen_at` is resolved by the system on the next run, unless
the next run reports it again, in which case it reopens. A dismissal with a
future `dismissed_until` survives recurrence; an elapsed dismissal reopens. An
`actioned` finding (the planner turned it into a topic) stays actioned while
still recording new sightings.

Planner plumbing, dormant until GSC exists: `listOpenPlannerFindings` returns
open `new_topic` findings ordered by score, `buildPlannerMessage` lists their
ids, `parsePlannerTopics` accepts a `sourceFindingId` only when the id was
supplied to it and silently ignores anything else, and a topic that points at a
finding marks that finding `actioned` with the topic id.

The analyst does not emit `agent.run.started` or `agent.run.succeeded`
notifications. Its dashboard, notification catalogue entries, and dismissal UX
belong to the dashboard workstream.

## Writer internal links

`listRecentPublishedPosts` was added beside `listRecentPublishedTitles` and
returns `{ id, title }` for recent published posts. The writer branch of
`buildUserMessage` now sends each title with its path (`/blog/<id>/`), because
the writer prompt asks for two or three inline links and titles alone cannot
build a valid path. `listRecentPublishedTitles` is unchanged and still serves
the planner.

## Retention

`runRetention` now also prunes `analyst_source_status` older than 90 days and
closed findings (`resolved`, `dismissed`, `expired`) older than 180 days. Open
findings are never pruned; the delete predicates were verified in the unit
test.

## Deployment order

Apply migration `0027_performance_analyst.sql` **and `0028_affiliate_report.sql`**
before the cron reaches this code. The reconciler inserts `schedule_mode` and
`system_managed`, the planner reads `analyst_findings`, and the affiliate report
source reads `affiliate_earnings_reports`, so an unmigrated database would fail
the run-due endpoint rather than degrade. The remote apply is the owner's step.

## Google credentials and the source clients

Added 2026-10-13. This is the part that turns the dormant `gsc`, `ga4`, and
`affiliate_report` sources on.

`src/lib/agents/analyst/credentials.ts` stores two credentials encrypted in
`settings` with the same AES-GCM envelope as the DeepSeek key, and only ever
returns a masked hint:

| Setting | Meaning |
| --- | --- |
| `analyst_gsc_service_account` | The Search Console service account JSON, encrypted |
| `analyst_gsc_property` | The Search Console property, URL prefix or `sc-domain:` |
| `analyst_ga4_service_account` | The GA4 service account JSON, encrypted |
| `analyst_ga4_property_id` | The numeric GA4 property id |
| `analyst_gsc_access_token` / `analyst_ga4_access_token` | The cached OAuth token and its expiry, encrypted |

The service account is validated by a pure function before storage: the JSON
must parse, `type` must be `service_account`, `client_email` must be an address,
`private_key` must be a PEM RSA key, and `project_id` must be present. A
rejection is a `422 ANALYST_CREDENTIAL_INVALID` naming the field. The API
returns the masked hint, the service account email (the operator has to paste it
into the Google Cloud and Search Console consoles), and the property. The
private key never reaches a response, `agent_runs.output`, a notification body,
or a source-status detail; the account is re-serialized into a canonical JSON
object before encryption so a read always validates the same shape.

`src/lib/agents/analyst/google-auth.ts` signs the JWT assertion with `jose`
(`RS256`, audience `https://oauth2.googleapis.com/token`), exchanges it at the
token endpoint, caches the token with a one-minute freshness skew, and maps
HTTP failures: 401/403 to `ANALYST_CREDENTIALS_REJECTED` without a retry, 404 to
`ANALYST_PROPERTY_NOT_FOUND`, 429 with `Retry-After` and 5xx to retryable
errors, a transport abort to a 504 `ANALYST_TIMEOUT`, and an unreadable body to
a 502. `withSearchRetry` gained an optional `isRetryable` predicate instead of a
second retry loop, and the analyst clients pass their own classifier.

`src/lib/agents/analyst/gsc.ts` calls `searchanalytics.query` three times per
run (`page`, `query`, `page+query`), pages at a 5,000 row batch up to a 25,000
row per-dimension cap, and reports truncation per dimension. Page URLs map to
post ids through `mapGscPageUrlToPostId`, which strips scheme, host, query, and
trailing slash and reuses `normalizeViewPath`; unmapped URLs are counted and
listed in the source detail instead of being dropped.

`src/lib/agents/analyst/ga4.ts` calls `runReport` for `sessions` and
`screenPageViews` by `pagePath` with the same pagination and error mapping. GA4
has no impressions, CTR, or position, and the source detail never claims them.
Its `screenPageViews` per matched post is compared with the first-party
`post_views` totals; a difference of more than five times is written into the
source detail as an explicit cross-check warning, not as a finding. The source
status type has no `degraded` member, and `src/lib/dashboard/analyst-presentation.ts`
is owned by the dashboard workstream, so the warning is recorded in the detail
of an `ok` source rather than by widening the union.

## Affiliate report importer

Added 2026-10-13. Migration `0028_affiliate_report.sql` adds
`affiliate_earnings_reports` (one row per network and period, unique on
`(network, period_start, period_end)`) and `affiliate_earnings_lines` (one row
per observation, unique on `line_hash`, indexed on `(product_id, report_id)`
and `order_day`).

`src/lib/agents/analyst/report-parse.ts` is the pure parser and
`src/lib/agents/analyst/report.ts` holds the coverage queries and the importer:

- Comma and tab separated text are both accepted; the delimiter is detected
  from the header line outside quotes, and quoted cells, escaped quotes, CRLF,
  and embedded newlines are parsed.
- Headers map through an alias table that tolerates the variants Amazon emits
  (`Amazon Order ID`, `Order Date`, `ASIN`, `Item Commission`, `Total
  Commission`, `Currency Code`, `Order Status`, `Clicks`, `Orders`, and
  similar). A file whose required columns cannot be mapped is rejected with
  `422 ANALYST_REPORT_INVALID` and the headers it saw.
- Amounts become integer cents and accept both `1,234.56` and `1.234,56`,
  currency symbols, signs, and parentheses. Dates accept ISO and Amazon's
  month-first `M/D/YYYY`.
- The ledger is append-only. `line_hash` is a SHA-256 over order id, target,
  order day, commission, currency, and status, so a repeated identical
  observation is skipped while a revised amount is stored as a second line.
  A second import of the same period is safe and reports its lines as skipped.
- `product_id` resolves at import time by matching `affiliate_products.target`
  to the ASIN through the affiliate program of the same network. A row whose
  target does not resolve is stored with a `null` product_id and counted; the
  import report tells the operator how many lines could not be attributed.

`readCommissionCoverage` counts the window days covered by any overlapping
report and returns `known` (every day), `partial` (some days), or `unknown`
(no overlapping day, including a stale report). Only `known` and `partial`
unlock the zero-commission rule, and the coverage state is stored in the
finding evidence, so a missing or stale report can never read as zero
commission. The source detail carries the covered day count, the unmatched
line count, and the latest period end.

Routes (mirroring the DeepSeek settings route, `withAdmin` and the
`{ data, meta }` envelope):

| Route | Behaviour |
| --- | --- |
| `GET /api/dashboard/settings/performance` | Masked credential descriptions, the analyst config, the latest source status per source, and the schedule |
| `PUT /api/dashboard/settings/performance` | Saves credentials. An absent field is unchanged; an empty string clears it. Structure is validated without calling Google |
| `POST /api/dashboard/settings/performance/test` | The only live call: a one-row Search Console query and a one-row GA4 report, per source `{ ok, detail }` |
| `POST /api/dashboard/settings/performance/report` | Imports a pasted report body (bounded to 2 MB), returns `{ imported, unmatched, skipped }`, records an activity entry |

## Activated rules

Added 2026-10-13, all reusing the existing rule helpers, caps, and ranking:

| Rule | Source | Trigger | Default thresholds | Effort | Cap |
| --- | --- | --- | --- | --- | --- |
| `title_meta` | GSC page dimension | Ranks on page one but earns few clicks | ≥20 impressions, position ≤10, CTR <2%, page ≥30 days old | S | 3 |
| `refresh` | GSC page dimension | Buried, or old with almost no clicks | ≥20 impressions, page ≥60 days old, and position >10 or CTR <2% | M | 3 |
| `new_topic` | GSC query dimension | Impressions with no article ranking for the query | ≥10 impressions, no post ranks for it, no existing topic or published title covers it | M | 3 |
| `product_check` | Imported report | Clicks with zero commission while the window is covered | ≥3 clicks, zero commission, no program problem, coverage `known` or `partial` | M | 3 |

Notes:

- A `refresh` finding for a post suppresses the `title_meta` finding for the
  same post, so the queue never carries two items for one page. The suppressed
  key is not passed as present, so an older `title_meta` finding for that page
  expires after three runs if the refresh keeps covering it.
- `new_topic` respects the planner backpressure limit of ten open findings
  (`ANALYST_NEW_TOPIC_QUEUE_LIMIT`, matching `MAX_PLANNER_FINDINGS`). At the
  limit the rule emits no new candidate but still passes its candidate keys to
  the persistence step, so an open queue cannot be expired by backpressure. The
  planner pulls at most ten findings per run, and queries that normalise to the
  same finding key are collapsed into one candidate.
- `product_check` stays silent when the coverage is `unknown`; the source
  status carries the explanation, and no finding is emitted.
- `ANALYST_RULE_IDS` keeps its six members because
  `src/lib/dashboard/analyst-presentation.ts` declares
  `Record<AnalystRuleId, string>`; the new ids live in
  `ANALYST_SOURCE_RULE_IDS` and `AnalystCandidateRuleId`. The dashboard label
  map falls back to the raw id until that workstream adds the three labels.
- A credential rejection or any other hard failure on `gsc` or `ga4` is
  recorded as an `error` source status and never aborts the run. A failure on
  `clicks`, `post_views`, or `affiliate_report` still aborts, because those
  sources are D1 reads.

## Verification of the credential work, and what remains unverified

Verified against stubs (no network, no real database):

- Service account validation: valid key, escaped newlines, PKCS#1 and PKCS#8
  blocks, and one rejection per required or malformed field.
- GSC property and GA4 property id validation, including `sc-domain:` and the
  `properties/` prefix.
- Encrypted round trip per source, absent field unchanged, empty string clears,
  masked description without the private key, and an unreadable ciphertext
  reported as unconfigured.
- Token cache freshness, encrypted storage, and refresh of a stale token.
- JWT signing verified with `jose` against the public key, token exchange
  body, and the 400 `invalid_grant` mapping.
- GSC and GA4 clients: success, pagination, the row cap and truncation flag,
  401 without retry, 429 with `Retry-After` (fake timers), 5xx retry, and an
  aborted transport mapped to 504.
- The URL and page-path mappers: `www`, query strings, fragments, trailing
  slashes, scheme-less input, and unmapped hosts or paths.
- The report parser: delimiter detection, quoting, alias mapping, required
  column rejection with the header list, both decimal formats, date formats,
  skipped rows, line hash stability and revision, coverage `known`/`partial`/
  `unknown`/stale, and import counting, deduplication, and unmatched rows
  against an in-memory D1 stub.
- Source wiring: an unavailable source stays `missing` with the original
  remediation, a rejected Google credential is an `error` status that the
  runner does not treat as fatal, a covered report attaches commission per
  product, and only the three D1-backed sources are fatal.

Unverified, because no Google credential exists in this environment:

- A real OAuth token exchange against `oauth2.googleapis.com`, including the
  service account being accepted and the scope being granted.
- The real shape of Search Console responses for this property, the real row
  counts, the real API's pagination and `Retry-After` behaviour, and whether
  the default thresholds (20 impressions, position 10, 2% CTR) fire at all on
  this site's traffic.
- The real GA4 `runReport` response shape for this property and the real size
  of the first-party versus GA4 divergence; the five-times factor is a chosen
  threshold, not a measured one.
- The service account email and property values the operator will actually
  paste, and whether the Search Console property is visible to that service
  account.
- A real Amazon Associates export, its exact header order, and its date and
  amount conventions. The alias table and the two decimal formats are written
  from the documented variants, and the required-column set is a decision:
  order id, order date, ASIN, commission, currency, and order status.
- The live `/test` endpoint and the live `/report` import are only exercised by
  unit tests and by hand, never against production D1 from this change.

## Verification

- `npx biome check --write` on every changed directory, clean.
- `npm run check`, zero errors.
- `npm test`, all suites green.
- `npm run build`, complete.
- The full migration chain was executed against a throwaway local SQLite file:
  the analyst row seeds with role `analyst`, `schedule_mode = 'weekly'`, and
  `system_managed = 1`; the delete trigger, the update triggers, and the
  partial unique index all reject the protected mutations; the findings upsert
  works; and the seeded prompt is byte-identical to the role definition.
