# Agents

The agents feature is split between the main Astro app and a small, separate Cloudflare Worker.

The Astro app owns everything the feature needs at runtime:

- The agents UI and API routes.
- The D1 storage for agents, runs, and drafts.
- The DeepSeek calls for every role.

The separate Worker, `light-agents`, only provides the cron trigger. It holds no
storage bindings and makes a single HTTP call.

## Setup

Create the shared token on both Workers. The same value must be used for both,
because the cron Worker sends it and the main app checks it.

```sh
wrangler secret put AGENT_CRON_TOKEN
npm run agents:secret
```

The first command runs from the repository root and sets the secret on the main
Worker. The second sets the same secret on the cron Worker.

## Deploy

```sh
npm run agents:deploy
```

## Verify

```sh
npx wrangler deployments list --config workers/agents/wrangler.jsonc
npm run agents:tail
```

## Schedule

The cron trigger runs every 15 minutes. Each tick now makes three calls. The first
is `POST https://lightscripts.com/api/agents/run-due`, which finds every agent
whose schedule is due. The second is `POST
https://lightscripts.com/api/agents/share-due`, which drives automatic sharing.
The third is `POST https://lightscripts.com/api/agents/notifications-due`, which
retries notification deliveries that failed, at most three times each. All three
are protected by the same `AGENT_CRON_TOKEN` bearer token and are independent, so
a failure or timeout in one does not skip the others.

The main endpoint enforces a 240 second budget with a 30 second safety margin and
gives each run its own deadline, so the cron call finishes before it is cut off.
Runs left in `running` for more than 20 minutes are closed as failed and their
claimed topic is released. On a tick with no agents due, one published post
without a cover is given a generated cover.

## Sharing

Automatic sharing distributes each newly published article to the enabled
channels. A channel is a configured destination: its provider, a label, whether
it is enabled, an optional daily cap, an approval requirement, and its
config. Non-secret config (such as a Telegram chat id) is stored in plain text and
secrets (such as a bot token) are encrypted with the `AGENT_SECRET_KEY` Worker
secret; the dashboard only ever reads back the non-secret config and the names of
the stored secret fields.

The outbox (`share_outbox`) holds one row per article per channel. A job starts
`pending` (or `awaiting_approval` when the channel requires approval), moves to
`sending` when the sender claims it, and ends `sent`, `failed`, or `skipped`.
Failures back off with a delay that grows with the attempt count, rate limits
reschedule the job and can pause the channel, and the dashboard can retry a job,
approve an awaiting one, test a channel, or pause sharing globally.

Phase 0a ships the admin JSON API and the Telegram provider only; other providers
and the React UI are Phase 0b.

The cron Worker has no public URL: `workers_dev` is disabled so only the cron
trigger can reach it. To exercise the manual `POST /run` handler, or the schedule
itself, run it locally with `npx wrangler dev --config workers/agents/wrangler.jsonc
--test-scheduled` and hit `/__scheduled`.

## DeepSeek key

The DeepSeek API key is entered in the dashboard, on the Agents page. It is
stored encrypted in D1 with AES-GCM, using the `AGENT_SECRET_KEY` Worker secret,
and it is never returned to the browser.

## Search provider

The scrapper does not invent facts from model memory. It runs a real web search,
fetches the pages it finds, and writes notes only from that text. Connect a
search provider on the Agents page; the key uses the same encrypted storage as
the DeepSeek key.

Providers live behind one `SearchProvider` interface in
`src/lib/agents/search`, so a new provider is an adapter plus a registry entry
and nothing else changes. Tavily ships first, and a `fixture` provider reads
`SEARCH_FIXTURE_JSON` for local development. When no provider is configured the
scrapper run is recorded as `skipped` and the topic is left untouched: it never
falls back to notes written from memory.

## Notifications

Every notable event is recorded in the `notifications` table and surfaced in the
dashboard bell and on the Notifications page. The event catalogue, its levels, its
push defaults, and its dedupe windows live in one place,
`src/lib/notifications/rules.ts`, so adding an event means adding a rule and one
`notify()` call site.

`notify()` is the only entry point. It resolves the rule, applies the dedupe
window, inserts the row, and then, if the rule and the operator both allow it,
delivers the message through the enabled channels. It never throws: a failing or
slow channel cannot fail the work that triggered it.

Channels live behind `src/lib/notifications/channels`. Two ship today:

- `email` calls the `send_email` binding, which is the Cloudflare Email Routing
  path. Sending to a verified destination address is free on every plan.
- `telegram` calls the bot API as plain text, with no `parse_mode`, so text that
  originated from a model cannot alter the message formatting.

Both adapters classify their failures the same way the sharing adapters do
(`channel_config`, `invalid_payload`, `rate_limited`, `transient`), and each send
has an eight second deadline. Delivery is considered successful when at least one
channel accepted the message, which is what keeps the cron retry from sending a
duplicate to a channel that already worked.

The cron Worker retries failed deliveries through
`POST /api/agents/notifications-due`, at most three attempts per notification.

## Spending budget

The **Spending budget** card caps what the agents can spend. Daily and monthly
search limits cap Tavily calls, a daily token limit caps DeepSeek usage, and a
pause switch stops all spending. You can also edit free credits per month and
price per credit (USD). Tavily gives the account a free allowance of 1,500
credits that resets each calendar month and does not roll over, and a basic
search costs one credit, so one search is one credit. Beyond the free allowance
usage is billed at $0.008 per credit, so set the monthly search cap to the free
allowance to avoid charges. The card shows the free monthly credit allowance
used, the estimated cost once usage passes the free allowance, and a warning when
the free credits are nearly used up (about 80 percent). When a cap is reached the
scrapper stops searching and agent runs are recorded as `skipped` with no model
call, so a run cannot drain a card. Usage is counted in the `usage_counters`
table and the monthly counter resets on the calendar month.

## Research page

The **Research** page (`/dashboard/research`), in the sidebar under Automation,
is where the scrapper's output is reviewed. It shows every topic with its
research status and its note counts (verified, unverified, and coverage gaps),
every research note across topics with filters by text, kind, and angle and a
verified-only toggle, the recent scrapper runs with their raw output viewable,
and current budget usage (searches today and this month, and the estimated cost).
Notes stay editable per topic from the Topics page, and the Research page links
into that same dialog. The scrapper runs on its schedule, works one phase at a
time, and a topic that is not finished stays in Fetched until a later run.

## Roles

- writer: drafts a new buying guide from a topic, using only verified research.
- reviewer: runs the editorial pass on a draft, or the final fact-check gate when auto publish is on.
- qc: audits the oldest pending draft for formatting, SEO fields, and policy issues.
- scrapper: searches the web and fetches sources, then writes verifiable notes tagged by angle and source type.

A writer produces drafts. Publishing only happens after a draft passes the
review stages below and a fact-check reviewer approves it. A reviewer will not
auto publish a draft whose topic has no verified research, and the scheduled
publisher enforces the same gate.

## Review stages

A draft is published only after three recorded stages:

1. QC audits the draft and records `qc_passed`.
2. A reviewer without auto publish runs the editorial pass and records
   `editorial_passed`.
3. A reviewer with auto publish is the final fact-check gate; approval records
   `fact_check_passed`, which is the only stage the publisher accepts.

Each agent claims only the drafts its stage allows, and a change request keeps
the stage so the same gate sees the revision. Published posts are backfilled to
`fact_check_passed` by `migrations/0024_review_stages.sql`.

## Demand brief

Before each planner run the runtime builds a small demand brief: a season line
for the current month and two recent news probes through the search provider.
The brief is deliberately weak signal, the planner prompt treats it as data
rather than instructions, and a missing provider degrades the brief to the
season line.

The Agents page has a **Run & publish** button that runs the enabled agents in
role order and publishes only drafts that pass the verified research gate. It
runs in the background; progress is visible on the Activity page.
