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

A manual trigger is available at `POST /run` on the cron Worker.

## Roles

- writer: drafts a new buying guide from a topic.
- reviewer: reviews the oldest pending draft, approves it, or requests changes.
- qc: audits the oldest pending draft for formatting, SEO fields, and policy issues.
- scrapper: collects research notes for a topic.

A writer produces drafts. Publishing only happens when a reviewer approves a
draft and that reviewer has auto publish enabled.
