# Content

This guide covers everything about writing and organizing posts in the dashboard.

## Create a post

1. In the sidebar, click **New post** (or go to `/dashboard/posts/new`).
2. Fill in the editor:
   - **Title**: 10 to 70 characters. The slug is generated from the title as you type until you edit the slug yourself.
   - **Body**: the main markdown editor (MDXEditor). The toolbar adds headings, lists, links, images, tables, code blocks, and video embeds.
   - **Organize**: the category selector and the tag input.
   - **SEO panel** (right column): slug, SEO title, meta description, focus keyword, cover image, canonical URL, publish date, and the noindex toggle.
3. Save with **Save draft** to keep it private, or **Publish** to make it live.

Required fields the server enforces when you save:

- `title` is 10 to 70 characters.
- `description` (meta description) is 50 to 160 characters.
- `pubDate` is required. The editor fills it with today's date.
- The slug must be lowercase letters, numbers, and single hyphens.

The SEO panel shows a live search preview at `/blog/<slug>/`, a word count and reading time, and a focus keyword checklist. The checklist is guidance only; it does not block saving.

## SEO panel fields

- **Slug**: the URL segment. The post lives at `/blog/<slug>/`.
- **SEO title**: an optional override for the browser and search title. Falls back to the title.
- **Meta description**: the summary shown in search results.
- **Focus keyword**: drives the checklist only.
- **Cover image URL** and **Cover image alt text**: stored in the post as `coverUrl` and `coverAlt`. There is no file picker for the cover; paste a URL, for example `/media/<uuid>.jpg` for an image you uploaded from the editor.
- **Canonical URL**: optional. Use it when the same content is published somewhere else.
- **Publish date**: the `pubDate`.
- **Hide this post from search engines (noindex)**: sets `noindex`.

## Post lifecycle

A post has one of three statuses, stored in the D1 `posts` table:

- **draft**: saved but not public. The public site only serves published posts, so drafts are never visible on `lightscripts.com`.
- **published**: live at `/blog/<slug>/`.
- **archived**: kept in the database but not served publicly. Use it for retired content. You can still filter to archived posts and edit them.

Drafts and archived posts are invisible to visitors. The public pages read from the same D1 database at request time.

When you open a published post, the editor also shows an **Unpublish** button. It moves the post back to **draft**. It does not archive it.

## Publishing is instant

Publishing does not trigger a rebuild or a deploy. The public site is server rendered and reads posts from D1 on each request. When you click **Publish**, the post is live on the next page load. There is no build queue to wait for.

## Categories and tags

A post has **one primary category** and **many tags**.

- Manage categories on the **Categories** page. Each category has a name, a slug, and a description.
- **Renaming a category slug rewrites every post that uses it.** When you change the slug in the Categories editor, the system updates the `category` value on all posts that referenced the old slug. This is enforced in the server code.
- A category that still has posts cannot be deleted. Reassign those posts to another category first.
- Tags are managed inside the post editor, not on a separate page. The tag input suggests tags already used on the site and lets you type a new one. A post can hold up to 20 tags, and each tag is at most 40 characters.

Note on category URLs: the Categories editor previews a topic URL of `/tag/<slug>/`. The public `/tag/<slug>/` page currently lists posts whose **tags** include that slug, so the on-site listing under a tag URL is driven by tags rather than by the category field.

## Media

Images are stored in Cloudflare R2 with their metadata in the D1 `media` table. Uploaded files are named with a fresh UUID and served at `/media/<uuid>.<extension>`, for example `/media/4f0c1c3a-...-9a.jpg`.

- **Accepted types**: JPEG, PNG, GIF, WebP, AVIF. The type is detected from the file's magic bytes, not from the filename.
- **Size limit**: 5 MB per image.
- **Library limit**: 500 images.
- **Upload today**: use the image button in the post editor toolbar. It uploads the file to `/api/dashboard/media` and inserts the returned `/media/<uuid>.<ext>` URL into the body. The cover image field in the SEO panel takes a URL, so paste the same `/media/...` URL there if you want to use it as the cover.

The upload stores the file in R2 and a row in D1. Deleting media removes both the R2 object and the D1 row through `DELETE /api/dashboard/media/<id>`.

## Not built yet

- The **Media** page (`/dashboard/media`) is a placeholder. There is no grid, no search, no alt text editing, no delete button, and no copy URL button in the dashboard.
- The **Pages** page (`/dashboard/pages`) is a placeholder. About, Terms, Privacy, Cookie Policy, and Affiliate Disclosure are still static Astro files on the site and are not editable from the dashboard.
- The **Redirects** page (`/dashboard/redirects`) is a placeholder. There is no redirect manager.
- The **Insights** page (`/dashboard/insights`) is a placeholder. Traffic and Search Console data are not shown yet.

## The posts table

The **Posts** page lists every post with its status, category, tags, and last updated date.

- **Filters**: status (all, draft, published, archived), category, and a search box that matches the title or the slug.
- **Pagination**: 20 posts per page, server side.
- **Multi-select**: tick the checkboxes to select posts, then use the bulk action to archive or delete them.
- **Row actions**: the three-dot menu offers Edit, Archive, and Delete.
- **Archive** sets the status to archived. It can be done from a row or in bulk.
- **Delete** removes the post permanently. There is no undo.

## Save conflicts

Each save carries a revision token. If a post changed somewhere else since you loaded it, saving fails with "This post changed elsewhere. Reload the page and try again." Reload and reapply your change.
