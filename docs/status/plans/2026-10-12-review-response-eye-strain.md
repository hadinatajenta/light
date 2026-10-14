# Review response: reducing eye strain at a desk

An external review of `reducing-eye-strain-at-a-desk-distance-lighting-breaks` was submitted on
2026-10-12. This records which findings hold up against the code and the production data, what the
reviewer could not see from the rendered page alone, and a plan for the changes that are worth
making.

Evidence throughout comes from production D1 and the live page, not from re-reading the article.

## Verdict on each claim

| Finding | Verdict | Evidence |
| --- | --- | --- |
| Products do not match the topic: a chair and a dual arm on an eye-strain article | **Valid** | The two `/go/` links on the page are `bestoffice-ergonomic-chair` and `mountup-dual-monitor-arm`. The article discusses lamp specifications at length and links no lamp. |
| Lamp specifications discussed with no lamp recommended | **Valid** | Ten `lighting` products exist (desk lamps, monitor light bars) and none is used. |
| `TÜV` discussed without a monitor recommendation | **Valid** | `TÜV` appears six times in the body. The recommendation is generic, not a product. |
| Footrest mentioned as a solution without a link | **Valid** | `footrest` appears twice, with no product link. |
| A dual arm is only relevant to two-monitor readers | **Valid** | Editorial judgement, and the traffic data agrees: the article's affiliate click rate is 1 click on 1 view, so nothing here is converting. |
| Recommendations are hedged ("may suit a buyer who") | **Valid** | The writer prompt requires trade-offs to be named, which the model expresses as hedging. There is no instruction to end a recommendation with a verdict. |
| The product block is text and links only, no image, specs, pros and cons, or a "best for" label | **Partially valid, and one part is blocked by policy** | The block is derived from `post_views`-free data: `AffiliateProduct.name` plus `notes`. Only **2 of 91** products have `notes`, so there is nothing to render. Adding an **image or a rating is not a design choice**: Amazon requires Product Advertising Content to come from PA-API, which this account does not have. Specs and "best for" are possible once notes exist. |
| Funnel breaks: no next step after "fix it without buying anything" | **Valid** | The article ends with the buying checklist followed by the sources list. No CTA, no scenario-to-product mapping. |
| No CTA after the checklist | **Valid** | Confirmed against the stored body. The last two sections are the checklist and the sources list. |
| Title is flat, no hook | **Valid observation** | Title is `Reducing eye strain at a desk: distance, lighting, breaks`. |
| Add a year to the title | **Conflicts with existing policy** | The writer prompt forbids year-stamped titles twice. This is an owner decision, not a bug. |
| The OG image is `og-default.png` for every article | **Valid, and it is a bug** | The article has a cover at `/media/4ef56579-f619-4431-99a5-9866ac9ee5bc.jpg`, and nothing reads it for `og:image`. `DEFAULT_OG_IMAGE` is the only source. |
| H2s are poetic rather than question-shaped | **Valid** | Examples: "the top bezel rule, and the number underneath it", "Most desk eye strain is a placement problem, not a panel problem". |
| Search intent is not aimed at pages that earn | **Valid** | There is no "best monitor for eye strain" or "best desk lamp for eye strain" page. The article's category is `buying-basics`, an editorial category with no products at all. |
| Taxonomy is messy, tags render as slugs | **Valid, and worse than described** | The article's own tags are `eye-strain`, `monitor-setup`, `desk-ergonomics`, `buying-basics`, and the footer prints them **raw**. A `topicLabel()` helper that would title-case them already exists in `src/lib/content/topics.ts` and is not used here. The wider topic list carries the exact overlaps named: `buying-basics` vs `buying-guide`, `accessories` vs `desk-accessories`, `ergonomics` vs `desk-ergonomics`. |
| Best answer is buried; add a Quick answer box | **Valid** | There is no summary block. The stored body opens with prose. |
| Too much text; geometry needs a side-view diagram | **Valid** | The article carries the numbers in prose and one table. No diagram exists. |
| Jargon without a short gloss: "popliteal height", "ciliary muscle" | **Valid** | `popliteal` appears twice, `ciliary` once, neither glossed. |
| An interactive calculator would help | **Valid, larger effort** | No client-side tooling exists on article pages. |
| No contextual internal links in the body | **Valid** | The stored body contains **zero** `/blog/` links. The four relevant guides (desk lamp, monitor, spec sheet, desk upgrade) appear only in "Related reading" at the bottom. |
| No email capture | **Valid** | There is no subscriber list, endpoint, or consent record. |
| Amazon links do not geo-redirect | **Valid** | The program template is `https://www.amazon.com/dp/{target}?tag={trackingId}` with no country handling. |

The review is accurate on nearly every observable point. Its one structural blind spot is that it
treats the monetisation gap as a design problem. It is a **data and categorisation** problem, which
the next section shows.

## What the reviewer could not see

### Why the wrong products appeared

The article's stored category is **`buying-basics`**. That is an editorial category, and **no
product carries it in its `topics`**, so the category-based top-up in `selectFeaturedProducts`
found nothing to add. The list fell back to the only two products the writer linked in the body: a
chair and a dual arm.

Its tags are `eye-strain`, `monitor-setup`, `desk-ergonomics`, `buying-basics`. Those are free-form
strings, not category slugs, so they never reach product matching. `monitor-setup` is an obvious
pointer to monitors and lighting, and it contributes nothing today.

So there are three separate causes, and the review named none of them:

1. The writer chose `buying-basics` for a topic that is really desk-setup or monitors.
2. Product matching uses the category only, never the article's tags.
3. Ten suitable `lighting` products sit unused because nothing routes the article to them.

### Two things the review could not know

- **The cost of images and ratings.** Product images are absent by policy, not by neglect. Every
  product has an empty `image_url`, and Amazon requires Product Advertising Content to come from
  the API. The same applies to star ratings, which the Program Policies forbid without the API.
- **Why the sources are not clickable.** The writer prompt forbids raw URLs, so the sources section
  names standards without linking them. The research notes do contain verified URLs for each
  source, so the writer could link them if the prompt allowed it.

## Plan

Sized in tiers so the cheap correctness fixes are not held hostage by the growth projects.

### Tier 1: bugs and cheap correctness (small, no new decisions needed)

| # | Change | Files | Notes |
| --- | --- | --- | --- |
| 1 | Use the post cover for `og:image`, falling back to the site default | `PostLayout.astro`, `utils/seo.ts` | Every article already has a cover. This is the single cheapest gain in the list, and it affects every share on every platform. |
| 2 | Title-case tag labels in the footer via the existing `topicLabel()` | `PostLayout.astro` | One line, reuses a helper that already exists. |
| 3 | Match products by category **and** the article's tags | `src/lib/affiliate/featured.ts` | Needs a tag-to-category mapping so `monitor-setup` can reach `monitors`. This is the fix that would have put a desk lamp on the eye-strain article. |
| 4 | Stop the writer filing product-adjacent topics into `buying-basics` | `src/lib/agents/roles.ts` | Add an explicit rule: a guide that names products in a category with inventory must be filed in that category. |
| 5 | Re-categorise the existing mis-filed posts | D1 data | Survey published posts whose category has no products and whose tags point elsewhere. |

Estimated effort: half a day. Risk: low, and each change is independently testable.

### Tier 2: packaging and conversion (medium, one owner decision)

| # | Change | Files | Notes |
| --- | --- | --- | --- |
| 6 | Open the article with a **Quick answer** block | writer prompt + `PostLayout.astro` | Prompt asks for it; the layout renders it as a styled callout rather than plain prose. |
| 7 | Question-shaped H2s | writer prompt | Replaces the current "write an experienced editor's voice" latitude with a rule: a section heading should be the question the reader typed. |
| 8 | Contextual internal links in the body | writer prompt + a supplied list of published titles | The prompt gets the published titles already; it needs permission and an instruction to link two or three of them inline where they are relevant. |
| 9 | A closing block that maps a scenario to a product | writer prompt + new section component | "If the free fixes did not work: shallow desk, fixed-height stand, window glare, wrong lamp." Each row pairs the scenario with one product from the supplied list. |
| 10 | "Best for" plus two or three checkable specifications per product | `notes` data + `ProductList.astro` | Blocked today by data: 2 of 91 products have notes. Needs a note-writing pass, which the agent can draft from the research notes and a human approves. |

Estimated effort: the prompt and layout work is one to two days; the product notes are a separate
pass over 91 products, best done incrementally as products get used.

### Tier 3: growth projects (large, each is its own decision)

| # | Change | Why it is its own project |
| --- | --- | --- |
| 11 | Taxonomy consolidation | ~20 free-form tags overlap 15 categories. Merging them means an alias table, tag page redirects, and stopping the writer from inventing tags. It touches content, URLs, and indexation. |
| 12 | "Best X for Y" commercial pages, pillar and cluster | Content strategy plus a template plus internal linking rules. This is what the review means by aiming at money pages. |
| 13 | Email capture with a printable checklist | Needs storage, double opt-in, an unsubscribe path, and a privacy policy update. CAN-SPAM and GDPR apply the moment addresses are stored. |
| 14 | Interactive distance and height calculator | A client island, its own a11y work, and a maintenance surface. |
| 15 | Generated SVG diagrams for geometry | Must be built from the numbers as deterministic SVG. AI image generation cannot be trusted with labelled diagrams. |
| 16 | Geo-aware outbound links | Either enable Amazon OneLink in the Associates dashboard, or map `request.cf.country` to a storefront with a per-store tag in `/go/[slug].ts`. OneLink needs a different tag per storefront, so this needs the owner's Associates setup, not just code. |

## Recommendation

Do **Tier 1 first**, in the order listed. Items 1 and 3 between them would have removed the
review's headline complaint: a unique share image on every article, and a desk lamp instead of a
chair on the eye-strain page. Items 2 and 4 cost almost nothing.

Then **Tier 2**, because the review is right that the article informs without converting, and the
fix is instruction and layout rather than architecture.

**Tier 3 should be scheduled deliberately, not bundled.** Items 11 and 12 change URLs and content
structure, and 13 introduces personal data with legal obligations.

## Decisions needed from the owner

1. **Year in the title.** The review wants `(2026)`. The writer prompt currently forbids it. Which
   does the site stand for? This is a positioning call, not a technical one.
2. **Product notes.** Are we willing to have the agent draft a "best for" line and two checkable
   specifications per product, reviewed by a human? Nothing in Tier 2 item 10 happens without it.
3. **Taxonomy.** Do we merge the overlapping tags into the category set, or keep free-form tags for
   long-tail pages and accept the overlap?
4. **Email capture.** Worth doing only if there is an intention to publish to a list. It is a
   commitment, not a widget.
5. **Amazon storefront handling.** OneLink, or a country map in the redirect. OneLink needs the
   owner's Associates configuration.
