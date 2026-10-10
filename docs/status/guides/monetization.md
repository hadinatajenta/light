# Monetization

This guide is short, because almost nothing is configured yet. It states plainly what exists today and what the owner still has to do.

## What exists today

Both affiliate and ad settings live in `src/config/monetization.ts`.

**Affiliate programs.** The file defines a `AffiliateProgram` type (network can be `amazon`, `impact`, `partnerstack`, `shareasale`, or `direct`) and an `AFFILIATE_PROGRAMS` lookup with three entries: Amazon Associates, Impact, and PartnerStack. Each entry holds a display name, a network, and a disclosure sentence. There is also a `DEFAULT_AFFILIATE_DISCLOSURE` sentence.

There is **no field for an affiliate tracking id or affiliate URL** anywhere in the config, and **no tracking id is configured**. Article links currently point to `example.com` (for example in `src/content/blog/how-to-choose-a-monitor-arm.md`), so there is no monetized link on the site yet.

**Ads.** The ad configuration is:

- `network`: `'none'`.
- `adsenseClientId`: `null`.
- `slots`: three placeholder ids.

Because `network` is `none` and `adsenseClientId` is `null`, **no ads render**. The `AdSlot` component shows a demo placeholder box instead, and the AdSense script is not loaded.

**ads.txt.** `public/ads.txt` is a placeholder line: `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`. Replace it with your real publisher line before you turn on ads.

## Ad slot ids and where they render

| Slot id | Value today | Where it is placed |
| --- | --- | --- |
| `in-article-top` | `0000000001` | Rendered in the post layout, above the article body, as a leaderboard |
| `in-article-mid` | `0000000002` | Defined in the config, not rendered anywhere yet |
| `in-article-bottom` | `0000000003` | Defined in the config, not rendered anywhere yet |

Even the top slot only renders a real ad when `network` is `adsense`, `adsenseClientId` is set, and the slot has a non-empty id. Otherwise it renders the demo placeholder.

## What the owner must do

Affiliate:

1. Register for the affiliate program you want (for example Amazon Associates, Impact, or PartnerStack).
2. Obtain your tracking id and the affiliate link format the program gives you.
3. Add your affiliate links manually in post bodies as normal links, since automatic link rewriting does not exist yet.

Ads:

1. Choose an ad network.
2. Get your publisher or client id.
3. Edit `src/config/monetization.ts` to set `network` and `adsenseClientId`, and replace the placeholder slot ids with real ones.
4. Replace `public/ads.txt` with your publisher line.
5. Deploy.

The **Monetization** page in the dashboard (`/dashboard/monetization`) is currently a placeholder with only a description. Configuration today is done by editing `src/config/monetization.ts` and `public/ads.txt` and redeploying. There is no dashboard form for it.

## Not built yet

- **Affiliate product catalog**: there is no list of products, no prices, and no per-product records.
- **Link rewriting**: there is no `/go` redirect route, no automatic tracking parameter injection, and no click counting. Links in posts are plain links.
- **Revenue reporting**: there is no earnings or click report anywhere in the CMS.
- **Affiliate disclosure from the editor**: the post layout shows the affiliate disclosure only when a post has `affiliate: true`, but the dashboard post editor always saves `affiliate: false`, so the disclosure does not currently appear on editor-created posts.
