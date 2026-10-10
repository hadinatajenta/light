# Deploy and operate

This guide covers local development, database migrations, seeding and export, deploying, secrets, backup, and verification.

## Requirements

- Node.js 24, matching `.nvmrc`.
- npm.
- A Cloudflare account with the `light-content` D1 database, the `light-media` R2 bucket, and the two Workers.

## Local development

Install dependencies and start the dev server:

```sh
npm install
npm run dev
```

The dev server prints a local URL.

### Dev auth bypass

Locally you do not log in through Cloudflare Access. When the app runs in dev mode and `DEV_ADMIN_EMAIL` is set, it uses a development auth provider that treats you as that admin automatically. This is how you reach `/dashboard` on localhost.

### Secrets locally

Local secrets live in `.dev.vars` at the repository root. It currently holds:

- `DEV_ADMIN_EMAIL`: the email the dev auth bypass signs you in as.
- `AGENT_SECRET_KEY`: the key that encrypts the stored DeepSeek API key.
- `AGENT_CRON_TOKEN`: the shared token the cron Worker sends to the run-due endpoint.

`.dev.vars` is for local development only and is never deployed. In production these are Worker secrets (see below).

## Database migrations

The D1 database is `light-content`, bound as `CONTENT_DB`. Migration files live in `migrations/`:

- `0001_init.sql`: posts, categories, media.
- `0002_activity.sql`: actors, activity, and a category timestamp.
- `0003_agents.sql`: agents, agent runs, settings, and the post review columns.

Apply migrations to the remote database:

```sh
npm run cf:db:migrate
```

Apply them to the local development database:

```sh
npx wrangler d1 migrations apply light-content --local
```

Always apply new migrations before running code that expects the new columns or tables.

## Seeding and export

- `npm run db:seed` reads the markdown posts in `src/content/blog/` and the categories in `src/data/categories.json`, and writes a `dist/seed.sql` file of `INSERT` statements. Use it to load existing content into a fresh D1 database.
- `npm run db:export` does the opposite: it reads posts, categories, and media from the remote D1 database and writes them back to `src/content/blog/*.md`, `src/data/categories.json`, and `src/data/media.json`. This is the markdown backup.

Both commands need Cloudflare credentials. `db:export` calls the remote database directly.

## Deploy

### Push to main

Pushing to `main` triggers the Cloudflare build for the main Worker. That build is configured as a Workers Build in the Cloudflare dashboard, not in this repository. CI also runs on every push to `main` (see Verification below).

### Manual deploy

Build the site, then deploy the Worker:

```sh
npm run build
npm run cf:deploy
```

`npm run cf:deploy` runs `wrangler deploy`, which deploys the main Worker using the bindings and routes in `wrangler.jsonc`.

### Deploy the cron Worker

The agents cron Worker (`light-agents`) is deployed separately:

```sh
npm run agents:deploy
```

It uses `workers/agents/wrangler.jsonc` and its only job is the every-15-minutes cron trigger that calls the run-due endpoint. It has no public URL.

## Secrets

Three secrets must exist for the agents feature and for git-based content access.

On the main Worker:

```sh
wrangler secret put GITHUB_TOKEN
wrangler secret put AGENT_SECRET_KEY
wrangler secret put AGENT_CRON_TOKEN
```

On the cron Worker:

```sh
npm run agents:secret
```

What each one is for:

- `GITHUB_TOKEN`: lets the content layer read and write the repository when the git-backed store is used instead of D1.
- `AGENT_SECRET_KEY`: encrypts the DeepSeek API key that you save on the Agents page (AES-GCM). Changing it makes a previously saved DeepSeek key unreadable, so re-enter the key after rotating it.
- `AGENT_CRON_TOKEN`: the bearer token the cron Worker sends to `POST /api/agents/run-due`. **The same value must be set on both Workers**, because the cron Worker sends it and the main app checks it.

Run each `wrangler secret put` from the repository root and paste the value when prompted.

Other configuration lives in `wrangler.jsonc` as plain vars, including the Access team and audience, the GitHub repository and branch, and the D1 and R2 bindings.

## Backup

The `backup-content` GitHub Actions workflow exports D1 to markdown daily. It runs at 03:00 UTC (`0 3 * * *`) and can also be triggered manually from the Actions tab. It runs `npm run db:export`, then commits any changes to `src/content/blog/` with the message `chore(content): sync markdown backup from d1`.

It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Verification

`npm run verify` runs the full check suite in order:

```sh
npm run verify
```

It expands to:

1. `npm run validate:content`: checks the markdown articles for missing or weak fields.
2. `npm run check`: type-checks the Astro and TypeScript files.
3. `npm run lint`: lints with Biome.
4. `npm run test`: runs the unit tests with Vitest.
5. `npm run build`: builds the site.

The `ci` workflow runs the same steps on every push to `main` and on every pull request.

Useful extras:

- `npm run cf:types`: regenerate the Cloudflare binding types.
- `npm run agents:tail`: stream logs from the cron Worker.
- `npm run format`: format with Biome.
- `npm run test:watch`: run tests in watch mode.
