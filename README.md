# Light Scripts

Light Scripts is a small, independent publication about home-office equipment, workspace ergonomics,
and desk setups. It runs on Cloudflare: Astro renders the public pages on Workers, D1 holds the
content, and R2 holds the media. The same deployment serves an admin dashboard and a small AI agent
pipeline that researches topics, drafts articles, and reviews them before anything is published.

## Stack

- Astro 7 on Cloudflare Workers, with prerendered pages where they never change
- D1 for posts, pages, topics, agents, settings, and analytics counters
- R2 for the media library
- React 19 islands for the dashboard, Tailwind CSS v4 for styling
- TypeScript in strict mode, Vitest for unit tests, Biome for lint and format

## Requirements

- Node.js 24, matching `.nvmrc`
- A Cloudflare account with `wrangler` authenticated, for deploys and remote data
- A `.dev.vars` file with the local secrets (`AGENT_SECRET_KEY`, `AGENT_CRON_TOKEN` at minimum)

## Getting started

```bash
npm install
astro dev --background
astro dev logs
```

The dev server runs in the background so the terminal stays free. Stop it with `astro dev stop` and
check it with `astro dev status`.

## Commands

| Command | What it does |
| --- | --- |
| `astro dev --background` | Start the local dev server in the background |
| `npm run build` | Build the site and the Worker into `dist/` |
| `npm run preview` | Preview the built site |
| `npm run check` | Type-check the Astro and TypeScript files |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run test` | Run the unit tests once |
| `npm run validate:content` | Check the D1 markdown export for missing or weak fields |
| `npm run check:links` | Check the live sitemap and the internal links on every page |
| `npm run verify` | Run every check and the build, in order |
| `npm run cf:db:migrate` | Apply pending migrations to the remote D1 database |
| `npm run db:export` | Export the D1 content to `src/content/blog` as a backup |
| `npm run cf:deploy` | Deploy the Worker to production |
| `npm run agents:deploy` | Deploy the cron worker that triggers the agents |

Run `npm run verify` before you commit. Deploys are manual: `npm run build && npm run cf:deploy`.

## How content works

Posts and pages live in D1, not in the repository. `src/content/blog` is a daily backup export, and
`npm run validate:content` checks that export. Editing happens in the dashboard at
`/dashboard`, which Cloudflare Access protects.

Articles follow a review flow: an agent or a person writes a draft, the quality control agent and the
deterministic preflight check it, and only an approved draft can be published, either immediately or
by the scheduler when its publication date arrives.

## How the agents work

The pipeline has four roles: a scrapper that researches a topic from live web sources, a writer that
drafts from verified research notes, a QC agent that audits the draft, and a reviewer that approves
or requests changes. Budgets cap searches and tokens per day, and the dashboard shows what every run
cost.

The cron worker (`workers/agents`) triggers `/api/agents/run-due` and `/api/agents/share-due`. A run
is not started twice: the agent is claimed atomically before it runs.

Sharing is an outbox: a published post becomes a job per channel, and the sender retries until the
channel accepts it. Telegram, Bluesky, Discord, Mastodon, and Pinterest are supported.

## Project layout

```
migrations/            D1 migrations, applied in filename order
scripts/               one-off jobs and checks that run outside the Worker
src/
  components/
    dashboard/         dashboard islands and cards
    ui/                shadcn-style primitives
  layouts/             page shells
  lib/
    activity/          audit log storage and queries
    agents/            pipeline, roles, budgets, research, and settings
    content/           D1-backed content store and public rendering
    media/             media store, image providers, and generation
    seo/               audit, link checking, and IndexNow
    sharing/           outbox, sender, and channel adapters
  pages/               routes; `dashboard/` is the admin area
  styles/              global stylesheet
workers/agents/        cron worker that triggers the pipeline
```

## Documentation

- `docs/status/task.md`: what is done and what is next
- `docs/status/techdebt.md`: known shortcuts, with the trigger that pays each one back
- `docs/status/guides/`: operator guides for SEO, agents, and the dashboard
- `docs/plans/`: the frozen plans for auto sharing and the SEO toolkit
