# Operator guides

These guides are for the site owner, not for engineers. They explain how to run the Light CMS day to day: writing and publishing posts, running the content agents, understanding what is monetized today, how the domains are wired, and how to develop, migrate, and deploy.

## What the CMS is

Light is a small affiliate review site built with Astro 7 on Cloudflare Workers. The public site is server rendered and reads its posts and categories from a D1 database, so publishing a post takes effect immediately with no rebuild. Alongside the public site there is a private admin dashboard you use to write posts, manage categories and media, and configure the content agents. The dashboard is a React application rendered as islands inside the same Astro project, and every dashboard page and dashboard API route is protected by Cloudflare Access.

## Which guide to read

| Guide | What it covers | Read it when |
| --- | --- | --- |
| [content.md](./content.md) | Writing a post, the editor fields, drafts and publishing, categories and tags, media, and the posts table | You want to write, publish, organize, or remove a post |
| [agents.md](./agents.md) | The four agent roles, the DeepSeek key, scheduling, the review gate, run history, and troubleshooting | You want to automate drafting, review, QC, or research |
| [monetization.md](./monetization.md) | What is configured today for affiliate links and ads, and what is still missing | You want to earn from the site |
| [domain.md](./domain.md) | The domains that serve the site, redirects, Cloudflare Access, Search Console, and media serving | You are changing a domain or checking where something is served |
| [notifications.md](./notifications.md) | The notification bell, the Notifications page, free email delivery through Cloudflare, Telegram delivery, and which events leave the system | You want to be told when an agent fails, a post publishes, or the budget runs low |
| [deploy.md](./deploy.md) | Local development, database migrations, seeding and export, deploys, secrets, backup, and verification | You are developing, deploying, or recovering the site |

## Environment

- The public site runs on `lightscripts.com`.
- The dashboard is served on `admin.hadinata.me`, and on `admin.lightscripts.com` once its Cloudflare Access application exists.
- The dashboard and its API are protected by Cloudflare Access. Requests to `/dashboard` and `/api/dashboard` that do not carry a valid Access identity are answered with a plain 404, so a misconfigured Access application looks like a missing page rather than a login prompt.

## How to use these guides

- Commands are written to be copy and pasted from the repository root unless stated otherwise.
- Where a screen or feature is described, it exists in the dashboard today.
- Where something is planned but not built, it appears under a "Not built yet" heading. Do not treat anything under that heading as working.
