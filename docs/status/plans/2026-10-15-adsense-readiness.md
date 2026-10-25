# AdSense readiness audit: lightscripts.com

Date: 2026-10-15
Scope: the live public site at https://lightscripts.com and the production D1 database `light-content`.
Reason: the AdSense application was rejected with "comply with AdSense program policies", which maps to the "There's a problem with your site's content" section of Google's help article 81904.

Method note: Python's default User-Agent is blocked by the site's bot protection, so every live check used `curl` with a desktop Chrome User-Agent. Every database check used `npx wrangler d1 execute light-content --remote --json`, prefixed with `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem`. Claims that could not be verified are marked as assumptions or explicitly unverified.

## 0. Bottom line

The rejection is a content verdict, not a plumbing verdict. The site renders correctly, its navigation is sound, and its technical files are in order. The site fails on one dominant clause: the pages are auto-generated at scale and the human authorship that Google uses as the counterweight is absent.

The three sentence summary:

1. 56 of 56 published articles were produced by an automated agent pipeline (the repo documents it, the database timestamps confirm a burst of 33 articles on a single day, and 62 of 68 stored images are machine-generated).
2. Every article is monetized with Amazon affiliate links (55 of 56 render an affiliate product block), and the author is a single name with no bio, no author page, and no first-hand content.
3. To qualify, the owner must stop fabricating-scale publishing, add genuine first-hand authorship and experience, and subordinate the affiliate monetization. Resubmitting the current site unchanged will fail again.

What is genuinely fine and should not be touched: sitemap, robots.txt, ads.txt, HTTPS, navigation, absence of broken links, and the absence of empty ad placeholder boxes.

## 1. The exact policy clauses that apply

All quotes are verbatim from the English pages, fetched 2026-10-15.

### From Google AdSense "Your AdSense account wasn't approved" (https://support.google.com/adsense/answer/81904?hl=en)

The section "There's a problem with your site's content" links "AdSense Program policies" and breaks common issues into subsections. The applicable clauses, verbatim:

Under "Insufficient content":

> Your site was found to have too little text, and/or your site was deemed to be "under construction." Sites should have sufficient high-quality content to provide meaningful user experiences and allow us to serve relevant ads to users.

> Your content should contain complete sentences and paragraphs, not only headlines.

Under "Content quality issues":

> Your site has content quality issues. We believe that there isn't enough original, rich content that would be of value to users. As a publisher, you must provide unique and relevant content that gives users a reason to visit your site.

> Don't place the ad code on auto-generated pages or pages with little to no original content.

> Your site shouldn't participate in affiliate programs without adding sufficient value to users. Affiliate program content should form only a minor part of the content of your site if the content adds no additional features.

Under "Content policy violations":

> Your site doesn't comply with AdSense policies.

Under "Site navigation issues":

> During our review of your site, we found your site difficult to navigate. Your site should provide a good user experience through clear navigation and organization.

> Potential navigation issues include: redirects, pages behind a login or restricted access, broken links, excessive pop-ups, dialers, and pages under construction or not yet launched.

### From Google AdSense "AdSense Program policies" (https://support.google.com/adsense/answer/48182?hl=en)

The clauses a page must not violate. Verbatim:

Under "Ad placement":

> Placed on any non-content-based page.

> Placed on pages published specifically for the purpose of showing ads.

Under "Site behavior":

> Sites showing Google ads should be easy for users to navigate.

Under "Deceptive site navigation":

> Publishers may not use deceptive implementation methods that place ads in a way that might be mistaken for menu, navigation or download links to obtain clicks or views.

> Linking to content that doesn't exist

### Supporting clauses from the spam policies that 81904 links

The 81904 "Content quality issues" text says "Review the Spam policies for Google web search for more help". The two clauses there that describe this site are at https://developers.google.com/search/docs/essentials/spam-policies.

"Scaled content abuse":

> Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users. This abusive practice is typically focused on creating large amounts of unoriginal content that provides little to no value to users, no matter how it's created.

> Using generative AI tools or other similar tools to generate many pages without adding value for users

"Thin affiliation":

> Thin affiliation is the practice of publishing content with product affiliate links where the product descriptions and reviews are copied directly from the original merchant without any original content or added value.

> Good affiliate sites add value by offering meaningful content or features. Examples of good affiliate pages include offering additional information about price, original product reviews, rigorous testing and ratings, navigation of products or categories, and product comparisons.

## 2. The live site against each clause

Every row below was fetched with curl and a Chrome User-Agent on 2026-10-15.

| URL | HTTP | Renders real content | Machine-made or policy-relevant signal |
| --- | --- | --- | --- |
| `/` | 200 | Yes, 9 guide links, marketing H1 | AdSense loader present, zero ad units |
| `/blog` | 200 | Yes, paginated guide index, 7 pages | 56 guides listed across pages; all recent |
| `/blog/standing-desk-height-range-measuring-for-sit-stand-use/` | 200 | Yes, full article | Byline "Hadinata Jenta", AI cover, affiliate product block, 16 `/go/` links, "Sources" section |
| `/blog/lumbar-support-height-how-to-adjust-and-measure-it/` | 200 | Yes, full article | Same pattern, 13 `/go/` links, top-of-page disclosure shown |
| `/blog/how-to-choose-a-monitor-for-a-home-office/` | 200 | Yes, full article | Same pattern, 8 `/go/` links, no top-of-page disclosure, product block only |
| `/about/` | 200 | Yes | Names no individual. Says "Every article is produced by the Light Scripts editorial team" |
| `/contact/` | 200 | Yes | Email `hello@lightscripts.com` only. No named person, no address, no phone |
| `/privacy` | 404 | No | The familiar short path does not exist; the page lives at `/privacy-policy/` |
| `/privacy-policy/` | 200 | Yes | Real policy text; says "operated from Indonesia" |
| `/terms/` | 200 | Yes | Real terms text |
| `/editorial-standards/` | 200 | Yes | Describes a research process, but "Every article is produced by the Light Scripts editorial team" |
| `/affiliate-disclosure/` | 200 | Yes | Real disclosure, including the Amazon Associates sentence |
| `/sitemap.xml` | 200 | Yes | Lists 56 articles, 12 tag pages, 7 pagination pages, static pages |
| `/robots.txt` | 200 | Yes | `User-agent: * / Allow: / / Disallow: /go/` plus sitemap |
| `/ads.txt` | 200 | Yes | `google.com, pub-5729173430518647, DIRECT, f08c47fec0942fa0` |

Clause-by-clause:

- Auto-generated pages (81904, "Content quality issues"): fails. The content is machine-produced. Repo evidence: `docs/agents.md` and `docs/status/light.md` describe a pipeline where a scrapper researches, a writer drafts, and a reviewer approves for automatic publication, with no human author per article.
- Insufficient or thin original content (81904, "Insufficient content" and "Content quality issues"): mixed. The text is long (bodies are 5,700 to 13,300 characters) and every article carries a "Sources" section, so it is not thin by volume. It is thin by originality: the whole corpus is generated from fetched web sources, with no first-hand testing.
- Affiliate content beyond a minor part (81904, "Content quality issues"): fails as a pattern. See section 4.
- Scaled content abuse (spam policies): fails. See section 5 and the timing evidence in section 3.
- Non-content-based or ad-only pages (48182, "Ad placement"): passes. No page exists only to hold ads, and no ad unit even renders.
- Site navigation (81904 and 48182): passes. See section 6.
- Deceptive navigation (48182): passes. No fake downloads or false streaming claims observed.

## 3. Human-identity signals

This is the single strongest counterweight to an auto-generated verdict, and it is almost entirely absent.

What exists:

- A byline string on every article and in the footer: "Hadinata Jenta". Source: `SITE_AUTHOR` in `src/consts.ts`.
- An `About` page and an `Editorial standards` page that describe a process in the first person plural ("we research", "we gather evidence").

What does not exist (verified):

- No author page. `/author/hadinata-jenta` returns 404. `/authors/hadinata-jenta` returns 404.
- No author bio anywhere. The `About` page names no individual. The footer credit is a name with no background, credentials, or photo.
- No author photograph. The site has no people photography at all.
- No real photography of products. The `media` table has 68 rows: 62 are machine-generated (`source = 'generated'`, each with a stored `prompt`), 0 are uploads, and 62 have no `creator`. Every article cover is one of these generated images.
- No first-hand experience. The articles describe how to measure, adjust, and choose, but none report owning, testing, or measuring a specific product. The voice is research-summary, not tested-review.
- No social profiles. `SOCIAL_PROFILES` is an empty array in `src/consts.ts`.
- Structured data undercuts authorship. The article JSON-LD declares `"author":{"@type":"Organization","name":"Hadinata Jenta"}`. A person is typed as an Organization, and the same string is used on every article. Source: `buildArticleJsonLd` in `src/utils/seo.ts`.

Generated-content and pacing evidence from the database:

- Published posts by day: 1 on 2026-06-08, then 2026-07-02, 2026-07-21, 2026-08-14, 2026-09-03, 2026-09-27, 2026-10-08, 2 on 2026-10-10, 33 on 2026-10-11, 4 on 2026-10-12, 5 on 2026-10-13, 4 on 2026-10-14, 1 on 2026-10-15. Total 56. Thirty-three articles in one calendar day is the clearest scaled-publishing fingerprint.
- All 56 published articles contain a "Sources" reference section.
- A template opening ("## Quick answer") appears at the very start of the newest articles. A raw body read of `lumbar-support-height-how-to-adjust-and-measure-it` begins with `## Quick answer` and a bulleted list before any prose.
- The site identity is asserted, not demonstrated. The `About` and `Editorial standards` pages promise a research method, but the only person credited is a name.

Assumption flagged: I did not verify who wrote any article by reading git history or agent logs. The pipeline description is drawn from the repository's own documentation and code, and the machine-generated imagery is drawn from the `media` table. Both are direct evidence, not inference from style.

## 4. Affiliate density

The relevant Google clause is "Affiliate program content should form only a minor part of the content of your site if the content adds no additional features." Affiliate presence is not minor or incidental on this site; it is on essentially every page.

Database counts (production `light-content`):

- Published posts: 56.
- Published posts with the `affiliate` flag set to 1: 0. The flag is never set.
- Published posts whose body contains an inline `product:` reference (an affiliate link): 33 of 56 (59 percent).
- Published posts whose body contains a literal `http` link: 0. Published posts mentioning "amazon": 0. Published posts mentioning "affiliate": 0. The affiliate links exist only as `product:` references and as the rendered product block, not as raw URLs in the text.
- Affiliate products in the catalog: 91. Affiliate programs: 1 (Amazon, tracking id `lightscripts-20`, status `approved`).
- Recorded affiliate clicks: 95.

Live-page counts (all 56 published articles fetched, 2026-10-15):

- Pages that render the "Products in this guide" affiliate block: 55 of 56.
- Pages that render a product-list disclosure: 56 of 56.
- Pages that render the top-of-article disclosure: 32 of 56.
- Pages that render an actual ad unit: 0 of 56.

Two conclusions follow.

First, the affiliate presence is effectively universal (55 of 56 pages), not a minor part. Every article funnels the reader to Amazon through `/go/` links.

Second, the disclosure logic is inconsistent. `PostLayout.astro` sets `showsAffiliateDisclosure = post.affiliate || rendered.affiliateLinks > 0`. Because `posts.affiliate` is 0 everywhere and only 33 bodies carry inline references, 24 pages show no top disclosure even though they render an affiliate product block. The block itself carries a disclosure, so no page is undisclosed, but the placement and the flag are not trustworthy.

## 5. Duplicate and orphaned content

Exact duplicate titles across all statuses:

- "Office chair armrest height and width: measure before buying"
  - `office-chair-armrest-height-and-width-measure-before-buying` (archived)
  - `office-chair-armrest-height-and-width-measure-before-buying-2` (published)
- "Standing desk mats: what to check before buying"
  - `standing-desk-mats-what-to-check-before-buying-2` (archived)
  - `standing-desk-mats-what-to-check-before-buying-3` (published)

The "three copies of one topic" claim is confirmed in the raw data, with a twist. Three ids share the "standing desk mats" slug:

- `standing-desk-mats-what-to-check-before-buying` (archived)
- `standing-desk-mats-what-to-check-before-buying-2` (archived)
- `standing-desk-mats-what-to-check-before-buying-3` (published)

Reachability verified by URL:

- `/blog/office-chair-armrest-height-and-width-measure-before-buying/` returns 404 (archived).
- `/blog/office-chair-armrest-height-and-width-measure-before-buying-2/` returns 200 (published).
- `/blog/standing-desk-mats-what-to-check-before-buying/` returns 404.
- `/blog/standing-desk-mats-what-to-check-before-buying-2/` returns 404.
- `/blog/standing-desk-mats-what-to-check-before-buying-3/` returns 200.

So no duplicate is reachable by URL. The archived copies are unreachable through the public route. This is the one piece of good news for the owner: the duplicate problem is a data-hygiene problem, not a live-duplicate-content problem.

Data-integrity defect found:

- `standing-desk-mats-what-to-check-before-buying` (archived) has a title about standing desk mats in its slug but its stored title is "Reducing eye strain at a desk: distance, screen height, lighting and breaks". The id and the title disagree.

Near-duplicate topics (distinct titles, heavy overlap). These are not exact duplicates but they are the same buying decision split across articles, which a reviewer reads as scaled coverage:

- Monitor arms: `how-to-choose-a-monitor-arm`, `how-to-choose-a-monitor-arm-for-a-two-monitor-setup`, `how-to-choose-a-monitor-arm-for-a-heavy-ultrawide-monitor` (3).
- Monitors generally: `how-to-choose-a-monitor-for-a-home-office`, `how-to-choose-a-monitor-for-spreadsheets`, `monitor-calibration-for-non-designers-what-actually-matters`, `monitor-resolution-and-scaling-for-text-work-a-practical-guide`, `monitor-brightness-and-contrast-for-office-lighting` (5).
- Office chairs: `office-chair-features-worth-paying-for`, `chair-seat-depth-and-height-office-chair-sizing`, `mesh-vs-foam-office-chair-seats-what-to-check-for-long-sitting`, `office-chair-casters-wheel-hardness-stems-and-floor-protection`, `office-chair-armrest-height-and-width-measure-before-buying-2`, `lumbar-support-height-how-to-adjust-and-measure-it`, `how-to-choose-an-office-chair-for-a-tall-user-measure-first` (7).
- Standing desks: `standing-desk-stability-what-to-check-before-buying`, `standing-desk-height-range-measuring-for-sit-stand-use`, `how-to-choose-a-standing-desk-for-a-small-home-office`, `how-to-choose-a-standing-desk-converter-measure-first`, `standing-desk-mats-what-to-check-before-buying-3` (5).
- Desks and desk height: `desk-height-and-keyboard-position-setting-up-for-comfort`, `how-to-size-a-desk-for-a-monitor-depth-width-and-viewing-distance`, `how-to-plan-a-desk-setup-you-will-not-outgrow`.
- Keyboards and input: `mechanical-vs-membrane-keyboards-for-long-writing`, `how-to-choose-a-keyboard-tray-when-your-desk-is-too-high`, `how-to-reduce-keyboard-noise-in-a-shared-room`.
- Lighting: `task-lighting-vs-ambient-lighting-at-a-desk`, `how-to-choose-a-desk-lamp-for-long-working-hours`, `how-to-choose-an-anti-glare-screen-for-a-bright-room`, `monitor-brightness-and-contrast-for-office-lighting`.
- Cable and desk tidiness: `cable-management-for-a-small-desk`, `desk-cable-trays-clamp-screw-or-adhesive-mounting`, `keeping-a-desk-tidy-trays-drawers-and-cable-boxes`.

Orphaned or stalled content (not reachable, not published):

- Drafts: `how-to-choose-an-office-chair-for-a-short-or-petite-user`, `monitor-height-on-an-arm-eye-line-tilt-and-viewing-distance`.
- Archived: `how-we-research-a-buying-guide`, plus the two duplicate leftovers above.

All 56 published bodies are byte-distinct (`COUNT(DISTINCT body) = 56`), so there is no verbatim body duplication among live articles.

## 6. Site navigation and ad experience

Navigation: healthy.

- I collected 67 unique internal links across the homepage, the blog index, and two article pages, then requested each one. Every link returned HTTP 200. No broken internal links were found.
- No redirect chains were observed on the sampled URLs; `curl` reported the requested URL as the effective URL each time.
- `/privacy` returns 404, but nothing links to it; the footer and sitemap use `/privacy-policy/`, which returns 200. This is a cosmetic gap, not a navigation failure.
- `robots.txt`, `sitemap.xml`, `rss.xml`, `search-index.json`, `llms.txt`, and `ads.txt` all return 200.

Ad experience: no visible defect, but also no ads.

- The AdSense loader script (`adsbygoogle.js?client=ca-pub-5729173430518647`) is present on every page checked, including the homepage and all 56 articles.
- No ad unit renders. `AD_CONFIG.slots` in `src/config/monetization.ts` maps every slot to an empty string, and `AdSlot.astro` returns nothing unless a slot id is truthy. I fetched all 56 articles and found `<ins class="adsbygoogle">` zero times.
- Because `AdSlot.astro` renders `null` when not live, there is no empty or placeholder ad box for a reviewer to see. This is a real strength and should not be changed while the site is under review.

So the rejection is not explained by broken navigation or a broken ad implementation. It is explained by content.

## 7. Traffic and indexing reality

The only first-party traffic source in the database is the `post_views` table. Its columns are `day`, `path`, `post_id`, `count`, and `updated_at`. There is no referrer, session, user-agent, or country column, and there is no Search Console data in the database.

What the table shows:

- Total recorded views: 174 (`SUM(count)`).
- Distinct posts that received any view: 36 of 56.
- Date range: 2026-10-12 through 2026-10-15.
- The largest single rows are `office-chair-armrest-height-and-width-measure-before-buying-2` with 17 on 2026-10-14 (the same day it was published/edited) and `lumbar-support-height-how-to-adjust-and-measure-it` with 18 on 2026-10-14.

What this does and does not support:

- 174 views over four days across a 56-article site is negligible. Traffic is not a plausible reason the site failed; there is essentially no traffic.
- The table cannot separate organic visitors from the owner, editors, automated checks, or bots, because it stores no source or referrer. Any claim that these 174 views are organic would be unsupported.
- I did not query Google's index, and the database contains no index-status data, so I cannot state whether the site is indexed or whether any organic discovery exists. The repository status file claims the Search Console property is verified and that the sitemap needs a resubmit, but that is a repository claim, not something I verified live.

The honest read: there is no first-party evidence of meaningful organic traffic, and the site is applying for AdSense with a content corpus that is machine-produced and monetized on nearly every page.

## 8. Prioritized remediation list

Ordered by impact on approval. Each item says what to change, who does it, and how to verify. "Owner" means the human must decide or create; "system" means a code or data change in this repo.

### P1. Stop the scaled automated publishing (owner, with system support)

Why: this is the clause the site most clearly fails: "Don't place the ad code on auto-generated pages or pages with little to no original content", reinforced by the scaled-content-abuse spam clause.
Change: Pause the agent pipeline so no new auto-generated article publishes. Do not present a corpus that grew by 33 articles in one day as an editorial library. Decide which articles to keep and which to unpublish.
Who: owner decides; system disables the writer/reviewer/publisher schedule.
Verify: new published count stops growing; the agents run page shows the writer and publisher disabled; re-query `SELECT status, COUNT(*) FROM posts GROUP BY status` on two separate days and confirm no change.

### P2. Build a real, named human authorship signal (owner, with system support)

Why: authorship is the counterweight named in Google's own guidance and referenced in the spam-policy human-review factors ("stated or implied authorship"). Today there is a name with nothing behind it.
Change (owner): create an author page with a real biography, relevant background, and a real photograph. Publish at least some content that only the person could write (see P3).
Change (system): change the article JSON-LD author from `Organization` to a `Person` with a `url` pointing at the author page, and add the author page to the sitemap and `llms.txt`.
Who: owner writes the biography and provides the photo; system updates `buildArticleJsonLd` and adds the author route.
Verify: `/author/<name>` returns 200; view-source of an article shows `"@type":"Person"` for the author; the profile is reachable from every article byline.

### P3. Add first-hand, first-person experience (owner)

Why: satisfies "provide unique and relevant content that gives users a reason to visit your site" and the good-affiliate-practice examples ("original product reviews, rigorous testing and ratings").
Change: for a focused set of articles, replace research-summary prose with first-hand reporting. Photograph the actual product in the actual setup, record real measurements, state what was tested and what was not. This must be true; do not invent testing.
Who: owner only. The system cannot generate this.
Verify: each rewritten article contains original photos with the owner as creator and at least one concrete, checkable first-hand claim.

### P4. Subordinate affiliate content (owner decides, system enforces)

Why: "Affiliate program content should form only a minor part of the content of your site if the content adds no additional features." Today 55 of 56 pages render an affiliate block.
Change: reduce the affiliate block to genuinely relevant articles, and ensure articles stand on their own without the shopping list. Consider removing the "Products in this guide" block from articles that do not explicitly discuss those products.
Who: owner decides scope; system changes the featured-product selection.
Verify: fetch all published articles and count `class="product-list"`; the ratio drops and the surviving pages justify each link in the text.

### P5. Make the affiliate disclosure deterministic (system)

Why: avoids an inconsistency a reviewer could read as concealing the commercial nature of a page.
Change: base `showsAffiliateDisclosure` on whether the rendered page actually contains any `/go/` link, not on the stale `post.affiliate` flag. Set `post.affiliate` correctly when a body carries `product:` references.
Who: system.
Verify: every page that contains a `/go/` link shows the disclosure at the top; a fetch of all articles confirms zero affiliate pages without a top disclosure.

### P6. Resolve duplicate and orphaned records (system, owner approves deletions)

Why: cleanliness, and to remove the risk that an editor later republishes a second copy.
Change: delete or keep permanently archived the unreachable duplicates (`office-chair-armrest-height-and-width-measure-before-buying`, `standing-desk-mats-what-to-check-before-buying-2`, and the third mats record `standing-desk-mats-what-to-check-before-buying`). Fix the mismatched-title record whose id is a mats slug but whose title is about eye strain. Review the two drafts and the `how-we-research-a-buying-guide` archive.
Who: system performs; owner confirms intent.
Verify: `SELECT lower(title), COUNT(*) ... GROUP BY` returns no duplicate titles; the mismatched id no longer exists. Note: no duplicate is currently reachable by URL, so this does not change today's public output.

### P7. Reduce topic overlap (owner decides, system reports)

Why: eight topic clusters are covered by many near-duplicate articles (for example three monitor-arm articles). A reviewer reads this as scaled coverage.
Change: merge or unpublish overlapping articles so each cluster has one strong piece.
Who: owner decides; system can surface the clusters.
Verify: the count per cluster falls to one, and the surviving article is the most complete one.

### P8. Confirm indexing and real demand before resubmitting (owner)

Why: Google's guidance is to provide pages users have a reason to visit. There is no evidence yet of demand.
Change: use Search Console to confirm how many pages are indexed and whether any queries bring impressions. Do not resubmit until there is a real, small base of human-read content.
Who: owner.
Verify: Search Console shows indexed URLs and non-zero impressions for branded or niche queries. This cannot be verified from the database, so it must be checked directly in Search Console.

### Lower priority

- P9. Add a `/privacy` redirect to `/privacy-policy/`. Cosmetic; nothing links to the 404.
- P10. Confirm the `/go/` redirect applies the Amazon tracking id `lightscripts-20` and lands on the intended product page. I did not exercise a `/go/` redirect, so this is unverified. This does not affect AdSense eligibility but does affect whether the affiliate program pays.

### Do not change

- Do not remove `ads.txt`; it is correct.
- Do not alter `robots.txt`, the sitemap, or the internal linking; they are all in order.
- Do not add ad placeholder boxes to make the site "look" monetized; the current behavior of rendering nothing when a slot is empty is correct and avoids the 48182 ad-placement clauses.

## Appendix: evidence commands

```sh
# status of all content
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx wrangler d1 execute light-content --remote --json \
  --command "SELECT status, COUNT(*) AS count FROM posts GROUP BY status;"

# publish burst by day
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx wrangler d1 execute light-content --remote --json \
  --command "SELECT substr(pub_date,1,10) AS day, COUNT(*) FROM posts WHERE status='published' GROUP BY day ORDER BY day;"

# affiliate flags and inline references
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx wrangler d1 execute light-content --remote --json \
  --command "SELECT (SELECT COUNT(*) FROM posts WHERE status='published' AND body LIKE '%product:%') AS inline_refs, (SELECT COUNT(*) FROM posts WHERE status='published' AND affiliate=1) AS flagged;"

# machine-generated imagery
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx wrangler d1 execute light-content --remote --json \
  --command "SELECT COUNT(*) AS media_rows, SUM(prompt IS NOT NULL) AS has_prompt, SUM(source='generated') AS generated, SUM(source='upload') AS uploaded FROM media;"

# duplicate titles
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx wrangler d1 execute light-content --remote --json \
  --command "SELECT lower(title) AS t, COUNT(*) AS c, group_concat(id, ' | ') AS ids FROM posts GROUP BY lower(title) HAVING c > 1;"

# live fetch with a browser User-Agent
curl -sS -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" \
  -o /dev/null -w "%{http_code}\n" https://lightscripts.com/blog/<slug>/
```
