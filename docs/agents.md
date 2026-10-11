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

## Roles

- writer: drafts a new buying guide from a topic.
- reviewer: reviews the oldest pending draft, approves it, or requests changes.
- qc: audits the oldest pending draft for formatting, SEO fields, and policy issues.
- scrapper: collects research notes for a topic.

A writer produces drafts. Publishing only happens when a reviewer approves a
draft and that reviewer has auto publish enabled.
