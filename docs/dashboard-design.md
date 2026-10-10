# Dashboard design

The admin dashboard for `light`: a small, authenticated web app that manages
content, media, structure, and settings, without leaving the git-based model.

## Goals

- One place to write, edit, and publish articles.
- Manage the things a content site needs and a file-only workflow does not
  provide: media, redirects, categories, settings, and insight.
- Stay git-based. Content remains Markdown in the repository. The dashboard
  is an editor over the repository, not a second source of truth.
- Be usable and accessible, not just functional.

## Non-goals for the first version

- Multi-tenant or multi-user roles beyond a single admin.
- A visual page builder.
- Real-time collaboration.

## UI approach

The dashboard is a React application rendered as islands inside the Astro
site, using Tailwind, which is already the styling system.

Recommended building blocks:

- **shadcn/ui** for components. It provides accessible primitives built on
  Radix, and the component source lives in this repository, so it can be
  themed to the existing two-color system instead of fighting it. It supports
  Tailwind v4 and Astro, and the `@/*` alias is already configured.
- **Recharts** for the Insights charts, which is what shadcn charts use.
- **Lucide** for icons, which pairs with the above.

Why not the alternatives:

- **DaisyUI** is fast and ships no JavaScript, but its look is a generic admin
  theme that conflicts with the editorial brand, and it does not provide the
  accessible dialog, menu, and combobox behavior that a data-heavy admin
  needs. It remains a reasonable choice if speed matters more than brand.
- **Flowbite** is framework agnostic but ships its own JavaScript bundle and a
  large dependency set, which is a poor fit for a React-island architecture.

## Layout

```text
+--------------------------------------------------------------+
| top bar: breadcrumb, search, account                         |
+----------------+---------------------------------------------+
| sidebar        |  content area                               |
|                |                                             |
| Dashboard      |                                             |
| Posts          |                                             |
| Categories     |                                             |
| Pages          |                                             |
| Media          |                                             |
| Insights       |                                             |
| Redirects      |                                             |
| Monetization   |                                             |
| Settings       |                                             |
|                |                                             |
+----------------+---------------------------------------------+
```

Sidebar is collapsible, keyboard navigable, and highlights the active route.
The top bar carries the current section and a global search over posts.

## Screens

### Dashboard

Overview cards: published count, drafts, scheduled, traffic last 7 days,
failed validations, recent activity. One small trend chart.

### Posts

- Table: title, status, category, updated date, published date.
- Filters: status, category, search.
- Actions: create, edit, duplicate, unpublish, archive.
- Pagination is server-side and bounded.

### Post editor

- Frontmatter panel: title, description, slug, category, tags, publish date,
  cover image, affiliate flag, noindex.
- Body editor: MDXEditor.
- Live preview toggle.
- Validation banner that lists what blocks publishing.
- Actions: save draft, preview, publish, unpublish.

### Categories

- List of categories with slug, label, description, and post count.
- Prevent orphan tags: warn when a tag has zero posts and is not linked.

### Pages

- Same editor as posts, for About, Terms, Privacy, Cookie Policy, and
  Affiliate Disclosure. Backed by a `pages` collection rather than hardcoded
  Astro files.

### Media

- Grid with search and filters.
- Upload with drag and drop, progress, and errors.
- Detail: alt text (required), dimensions, size, copy URL, used-in.
- Delete warns when the media is referenced by a post.

### Insights

- Traffic over time from Cloudflare Web Analytics.
- Search queries and impressions from Search Console.
- Top pages and top queries.
- Data is cached; the UI never calls a third party directly.

### Redirects

- Table of from, to, status code.
- Writes to the `_redirects` file.
- Warn on a redirect that loops or points to an external host.

### Monetization

- Affiliate programs and their disclosure text.
- Generated `/go` links and click counts.
- AdSense client id and slot mapping.

### Settings

- Site title, description, social links, default OG image.
- Analytics id.
- SEO defaults.

## Data and security

- Content: `ContentStore` over git, one commit per save, idempotency key on
  write, optimistic revision to detect conflicts.
- Media: `MediaStore` over R2.
- Auth: Cloudflare Access now. A custom email and password provider is planned
  behind the same `AuthProvider` interface, reconciled by email.
- Every `/api` route authenticates and authorizes server-side. The UI hiding a
  button is not a control.
- Uploads are validated by extension, declared type, and magic bytes, renamed,
  size bounded, and served from R2, never as active content on the site origin.
- Secrets are Worker secrets, never in the repository.

## Phases

1. Foundation: Cloudflare adapter, Access protection, dashboard shell with
   sidebar and layout, auth-ready skeleton.
2. Content: posts list, post editor with MDXEditor, media with R2, save to git,
   publish.
3. Structure: categories, pages collection, settings.
4. Intelligence: insights, redirects, monetization.
5. Polish: scheduling, preview, audit log, validation surfaced in the UI.
