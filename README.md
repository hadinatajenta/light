# Light

Light is a small, independent review site. It is a static website built with Astro, so the pages are
generated at build time and hosting stays cheap and fast.

This repository is the whole site: layouts, components, articles, and the checks that keep it tidy.

## Stack

- Astro 7, static output
- TypeScript in strict mode
- Tailwind CSS v4 for styling
- Content collections for articles, written in Markdown
- Vitest for unit tests, Biome for lint and format

## Requirements

- Node.js 24, matching `.nvmrc`
- npm

## Getting started

```bash
npm install
npm run dev
```

The dev server prints a local URL. Open it in a browser.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Preview the built site |
| `npm run check` | Type-check the Astro and TypeScript files |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run test` | Run the unit tests once |
| `npm run validate:content` | Check articles for missing or weak fields |
| `npm run verify` | Run every check and the build, in order |

Run `npm run verify` before you commit.

## Writing an article

Articles live in `src/content/blog/`. Each file is Markdown with a small block of frontmatter at the
top:

```markdown
---
title: "A clear title under 70 characters"
description: "One or two sentences, between 50 and 160 characters, that explain what the article covers."
pubDate: 2026-10-01
tags: ["monitors", "desk-setup"]
affiliate: false
---

The article body goes here.
```

The checks enforce a few rules:

- `title` is between 10 and 70 characters.
- `description` is between 50 and 160 characters.
- `pubDate` is required.
- `draft: true` keeps an article out of production builds but visible during development.
- The body should be at least 300 words.
- No `TODO` or placeholder text.

## Project layout

```
public/                files copied to the site untouched, like robots.txt and ads.txt
scripts/               checks that run in CI
src/
  assets/blog/         article images, optimized by Astro
  components/          reusable pieces of UI
  config/              monetization settings
  content/blog/        articles
  layouts/             page shells
  pages/               routes, one file per URL
  styles/              global stylesheet
  utils/               small helpers, most of them unit tested
```

Only `src/pages/` is special to Astro. The other folders are a convention that keeps the project
readable.

## Set these before launch

1. `astro.config.mjs`: replace `https://example.com` with the real domain.
2. `public/robots.txt`: update the sitemap URL to the real domain.
3. `public/ads.txt`: replace the placeholder line with the publisher ID from your ad network.
4. `src/consts.ts`: site title, description, and navigation links.
5. `src/config/monetization.ts`: affiliate programs and ad network settings.

## Deployment

The site is static, so it runs anywhere that serves files. Cloudflare Pages is a good default and has
a free tier.

The scheduled workflow can deploy on a schedule. To turn it on, add the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets, then set the `DEPLOY_ENABLED` and `CLOUDFLARE_PROJECT_NAME`
repository variables.

## Not done yet

- Ad slots render nothing until an ad network is configured in `src/config/monetization.ts`.
- `public/_redirects` is empty. Add a line like `/old-path /new-path 301` when a URL changes.
- The site URL in `astro.config.mjs` and `public/robots.txt` is still a placeholder.
