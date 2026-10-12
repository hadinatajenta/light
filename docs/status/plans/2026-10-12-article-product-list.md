# Product list on the article page

Decision recorded 2026-10-12, applied to production the same day. This documents the
reader-facing shopping list, the Amazon policy constraint that shapes it, the product
data cleanup it depended on, and the exact database changes.

## The constraint: no prices

Amazon's Associates Program Policies (updated 2026-04-14) state:

> Product prices and availability may vary from time to time. Because prices for and
> availability of Products that you have listed on your Site may change, your Site may
> only show prices and availability if: (a) we serve the link in which that price and
> availability data are displayed, or (b) you obtain Product pricing and availability
> data via Creators API or PA API and you comply with the requirements regarding use of
> Creators API or PA API in the License.

The same policy also forbids displaying customer reviews or star ratings without the API
(section 2(t)) and forbids price tracking or alerting functionality outright (section
2(y)).

The site has no PA-API access, which requires qualifying sales first, and the catalogue
holds a manually entered price for one product out of ninety-one. So a price column was
not built. The list shows a product label and a button that says **Check price on
Amazon**, which is also what section 2(w) requires: a link must not be arranged in a way
"that makes it unclear that you are linking to an Amazon Site". Naming Amazon in the
button satisfies that and is clearer to the reader than a bare "check price".

Product images are also absent by choice. Every product has an empty `image_url`, and
Amazon requires Product Advertising Content to come from the API.

## What was built

- `src/lib/affiliate/featured.ts` holds the selection as pure functions, so it is
  testable without a database: `extractReferencedProducts`, `normalizeLinkLabel`,
  `isGenericLinkLabel`, `selectFeaturedProducts`.
- `src/components/ProductList.astro` renders the list twice: a `Shopping list` section
  inside the article after the body, and a compact card in the right rail that used to
  hold a hard-coded "Sponsored placement" placeholder.
- `PostLayout.astro` selects the products once and renders both placements.

### How a product is chosen

Two sources, in this order, capped at four:

1. **Referenced.** Every `[text](product:slug)` in the body, in order of first
   appearance. The label is the article's own link text, cleaned of a leading
   determiner, because that is the sentence the writer already justified. A generic
   label such as "Check availability" is discarded in favour of the catalogue name.
2. **Top-up.** Active products whose `topics` include the article's category, ranked by
   `rankCatalogForTopic` against the article title and tags, reusing the writer's own
   ranking. This is what raises coverage: an article with no inline links still gets a
   relevant list.

`topics` is therefore the curation gate as well as the matching key. A product with no
`topics` is never listed publicly. Exactly one product is deliberately in that state:
`16-14-monitor-light-office-gameing` has an unreadable name and no identifiable brand.

## Why the product data had to be fixed first

Before this change the catalogue was unusable as a public list:

| Problem | Count before |
| --- | --- |
| Products with no `topics`, so category matching could not work | 89 of 91 |
| Product names that were keyword-stuffed or truncated scraped titles | most |
| Published posts with no category, so nothing could match them | 7 |

Real examples of the names: "Cushioned Kitchens Standing Phthalate Relieves",
"Samsung Resolution Compatible FreeSyncTM LS27FG502ENXZA", "Clamp 2250LM Eye Caring
Dimmable White". Showing those to a reader would have cost more trust than the links
earned.

The fix was a deterministic keyword pass plus a manual review of all ninety-one rows,
producing a descriptive label and one or more category slugs per product. Examples:
"HUANUO FlowLift gas-spring monitor arm", "Univivi under-desk cable management tray",
"TEMGCUAM acoustic panel". The labels describe the product category rather than repeat a
brand's marketing title, which is honest, if less specific than an API-sourced title.
The owner should spot-check them in the catalogue.

The seven uncategorised posts were the highest-value guides on the site, all
"how to choose" pieces: monitors, a monitor arm, chairs, keyboards, noise-cancelling
headphones, desk planning, and spec sheets. Each was given its obvious category.

### Database changes

```sql
-- 91 statements of this shape, one per product
UPDATE affiliate_products
SET name = 'HUANUO FlowLift gas-spring monitor arm',
    topics = '["monitors","desk-setup"]',
    updated_at = datetime('now')
WHERE slug = 'huanuo-flowlifttm-mechaspring-fully-adjustable-tool-free';

-- 7 statements of this shape, one per post
UPDATE posts SET category = 'monitors', updated_at = datetime('now')
WHERE id = 'how-to-choose-a-monitor-for-a-home-office'
  AND status = 'published' AND (category IS NULL OR TRIM(category) = '');
```

Both are guarded, so re-running is safe. The original names are not kept in the
database; the mapping was reviewed as a whole before it was applied and is reproducible
from this repository's history.

## The disclosure was write-only

`loadAffiliateContext` never read the disclosure saved from the dashboard, so the text an
operator edited had no effect and the article always fell back to the hard-coded
default. It now reads the `affiliate_disclosure` setting through `getSetting`, with the
program disclosure as the fallback. `AFFILIATE_DISCLOSURE_SETTING` moved to
`src/config/monetization.ts` so the settings route and the store share one constant.

The list also repeats the disclosure inside the block, because the existing disclosure
paragraph sits above the article body and an FTC-clear disclosure should be near the
links it covers.

## Writer prompt

The affiliate section of the writer prompt now requires two to four product links when
the supplied catalogue fits the topic, asks for the product name or a plain description
as the link text, and forbids a generic label on its own. Previously a writer could
produce a complete article with no links at all.

## A build fix this uncovered

`vitest.config.ts` had no `@` alias, so any module with a runtime `@/` import failed to
load in a test. It only surfaced now because `src/lib/affiliate/store.ts` started
importing `AFFILIATE_DISCLOSURE_SETTING` as a value rather than as a type. The alias is
now configured, matching `tsconfig.json`.

## Result

| Measure | Before | After |
| --- | --- | --- |
| Published articles with any affiliate link in the body | 22 of 47 (46%) | unchanged |
| Published articles showing a product list | 0 | **46 of 47 (98%)** |
| Products with category topics | 2 of 91 | 90 of 91 |
| Products with a readable label | most unreadable | 90 of 91 |
| Disclosure text from the dashboard | ignored | rendered |

The one article without a list is `how-to-read-a-product-spec-sheet-without-being-fooled`
in `buying-basics`, which has no products by design.

## Not built yet

- There is no product image, rating, or price. The first two are blocked by policy, the
  third is blocked by policy without PA-API access.
- Matching is by category plus title relevance, not by an explicit post-to-product
  mapping. A narrow article can still be topped up with a product from the same
  category that a human would not have chosen. An explicit mapping table would fix it.
- The list is not editable per article. It is derived, so changing it means changing the
  article body or the catalogue.
- Clicks are recorded per product, not per placement, so the article block and the rail
  card cannot be compared against each other.
