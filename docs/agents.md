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
schedule is due. The main endpoint enforces its own time budget and stops before
that budget is exhausted, so the cron call can take up to about 110 seconds.

The cron Worker has no public URL: `workers_dev` is disabled so only the cron
trigger can reach it. To exercise the manual `POST /run` handler, run it locally
with `npx wrangler dev --config workers/agents/wrangler.jsonc`.

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
