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

The cron trigger runs every 15 minutes. Each run calls
`POST https://lightscripts.com/api/agents/run-due`, which finds every agent whose
schedule is due. The main endpoint enforces a 240 second budget with a 30 second
safety margin and gives each run its own deadline, so the cron call finishes
before it is cut off. Runs left in `running` for more than 20 minutes are closed
as failed and their claimed topic is released. On a tick with no agents due, one
published post without a cover is given a generated cover.

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
- reviewer: reviews the oldest pending draft, approves it, or requests changes.
- qc: audits the oldest pending draft for formatting, SEO fields, and policy issues.
- scrapper: searches the web and fetches sources, then writes verifiable notes tagged by angle and source type.

A writer produces drafts. Publishing only happens when a reviewer approves a
draft and that reviewer has auto publish enabled. A reviewer will not auto
publish a draft whose topic has no verified research, and the scheduled
publisher enforces the same gate.

The Agents page has a **Run & publish** button that runs the enabled agents in
role order and publishes only drafts that pass the verified research gate. It
runs in the background; progress is visible on the Activity page.
