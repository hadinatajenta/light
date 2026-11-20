# Monetization Paths for lightscripts.com

## 1. Google AdSense ("Tindakan diperlukan")

*"Tindakan diperlukan"* (*Needs attention*) corresponds to `"Your site isn't ready to show ads"` across three main causes [1]:
- **Low-value / thin content:** Spec rewrites without hands-on testing or original photos trigger **Thin affiliation** / **Scaled content abuse** spam policies [2] and fail **Reviews** guidelines [3]—common after an algorithmic quality demotion.
- **Navigation & trust gaps:** Missing About, Contact, Privacy Policy, or disclosure pages, broken links, thin archives, or poor mobile UX [1, 4].
- **Crawler / Cloudflare blocks:** Missing `<head>` ad code/Search Console link [1], `robots.txt` blocking `Mediapartners-Google` [5], or Cloudflare WAF/Bot Fight Mode challenging Googlebot [6].

**Pre-reapply checklist (35-page Astro + Cloudflare Workers site):**
1. Permit `Mediapartners-Google` and `Googlebot` in `robots.txt` [5] and Cloudflare WAF [6]; verify Search Console ownership or `<head>` snippet across Astro layouts [1].
2. Ensure clean menus, zero 404s, Privacy Policy, Terms, About, Contact, affiliate disclosures, and author bios; `noindex` thin archive/tag pages [1, 4].
3. Upgrade guides with original photos, test measurements, and buyer comparisons [3]; remove empty ad slots [1].

**Wait time & payouts:** Google enforces **no fixed cooldown** [1], though rapid resubmissions (Oct 15 → Oct 29 → Nov 5) risk repeated automated rejections or lockouts `[Unverified]`. Wait **4–8 weeks** `[Unverified]` while publishing 8–16 photo guides and verifying GSC impression growth. Indonesian AdSense pays via IDR EFT or wire (**Rp 1,300,000** threshold) [7, 8].

---

## 2. Affiliate Programs (Indonesian Publisher)

**Amazon Associates US:** Pays **2.50%** on *PC/PC Components* (monitors, keyboards, mice, webcams, docks `[Unverified]` by SKU), **3.00%** on *Furniture*, *Headphones*, *Business Supplies*, **2.00%** on *Televisions*, and **4.00%** on *Fire/Echo/All Other Categories* [9]. New accounts need **3 qualifying sales in 180 days** (no personal orders; content updated within ~60 days; rejected IDs aren't reinstated) [10, 11]. Fx4Cash excludes Indonesia [12]; use **Payoneer's virtual US ACH** (**$10 min**, paid ~60d post-month-end) or Gift Cards (**$10 min**), avoiding checks (**$100 min**) [13] (Wise USD often fails non-US checks `[Unverified]`).

**Networks (Indonesia):** **Impact** pays ID via IDR/wire or PayPal (2% fee, $20 cap; **$10 min**) [14, 15]. **Awin** (absorbed **ShareASale** Aug 2025 [16]) pays via **Payoneer** (**$20/€20/£20 min**, $50 default; £5-equiv card check `[Unverified]`) [17, 18]. **CJ** pays via Payoneer/DD (**$50 min** `[Unverified]`, no PayPal). **Rakuten** pays via PayPal/DD (**$50 min** `[Unverified]`, **no Payoneer**) [19]. **PartnerStack** pays ID via PayPal/Stripe/Airwallex (**$5 min** `[Unverified]`, SaaS) [20].

|Brand / Retailer|Network|Rate|Cookie|Approval / Notes|ID Accepted? (`[Unverified]`=brand-level)|
|:---|:---|:---|:---|:---|:---|
|**FlexiSpot** [21,22]|Impact (US), Awin (UK/CA)|4%–12%|30d (45d CA)|Niche review; no fixed floor `[Unverified]`|Net yes; brand `[Unverified]`|
|**Uplift Desk** [23]|Impact|~3%–7% `[Unverified]`|30d|Manual review; US shipping|Net yes; brand `[Unverified]`|
|**Branch** [24,25]|CJ (`5885920`)|5%|30d|CJ review; US/CA buyers|Net yes; brand `[Unverified]`|
|**Autonomous** [26]|CJ/Rakuten; Direct|3%–8% `[Unverified]`; 10% Pod|30d `[Unverified]`|WorkPod targets trade/retail|`[Unverified]`|
|**Secretlab** [27]|CJ|Up to 12%|7d|Manual review; creators/blogs|**Yes** ("no geo restrictions")|
|**Herman Miller** [28]|CJ|1%–10% `[Unverified]`|30d `[Unverified]`|CJ review|Net yes; brand `[Unverified]`|
|**Steelcase** [29]|CJ (`6052132`)|3% (`~$900` AOV) `[Unverified]`|30d `[Unverified]`|CJ review|Net yes; brand `[Unverified]`|
|**DWR / Crandall / Smart Furniture** [30,31]|CJ (DWR), Awin (Crandall), FlexOffers (Smart `[Unverified]`)|4%–10% DWR; 3% Crandall ($500+ AOV)|30–45d DWR/Smart; 30d Crandall|Crandall: remanufactured Steelcase/HM|Nets yes; brands `[Unverified]`|
|**Logitech** [32]|Impact|4%–10% ($125 AOV)|30d|Brand-safe tech site|Net yes; brand `[Unverified]`|
|**Keychron** [33]|GoAffPro (Direct)|5%+|7d (30d hold)|Easy entry; **PayPal**|**Yes** (global)|
|**BenQ** [34]|CJ (`7236824`)|2%–5% (5% ScreenBar/ZOWIE; 2–3% monitors) `[Unverified]`|30–45d `[Unverified]`|US storefront sales only|Net yes; brand `[Unverified]`|
|**Elgato** [35]|Impact / Direct|~1%–3% `[Unverified]`|30d `[Unverified]`|Direct portal **closed**|`[Unverified]`|
|**Anker** [36]|Direct / Awin / CJ|8% US (5%–8% global)|30d|Open to review sites|Global yes; US `[Unverified]`|
|**UGREEN** [37,38]|Impact / Awin (`90851`)|8%–15% ($180 cap/NAS)|30d (60d Awin header)|2–3d review|**Yes** (global/SEA)|
|**Satechi** [39]|Direct / Impact `[Unverified]`|4%–10% `[Unverified]`|30d `[Unverified]`|Ambassador review|`[Unverified]`|
|**CalDigit** [40]|**None** (resellers only)|—|—|Use Amazon (2.5%–4%) / B&H (2%–8%, 60h `[Unverified]`)|Via Amazon/B&H|

**Top 10 Expected Value (Low-Traffic ID Site):** **1. Amazon Associates US** (apply at 50–100 clicks/wk: widest catalog, 24h halo cart), **2. UGREEN** (8%–15%, fast approval), **3. Anker** (8% US, fast-moving), **4. Keychron** (5%, easy PayPal), **5. Secretlab** (up to 12%, global/ID), **6. FlexiSpot** (4%–12%, desk AOV), **7. Logitech** (4%–10%, $125 AOV), **8. Branch** (5%, $400+ AOV), **9. Crandall Office** (3%, $500+ remanufactured chairs), **10. BenQ** (5% ScreenBars/arms, 2%–3% monitors).

---

## 3. AdSense Alternatives (Low/No Minimums & Astro)

- **Journey by Mediavine** [41]: **5,000 sessions/mo** (US/UK/CA/AU/DE/FR/NL); **>=4-mo domain**; Grow optional; **Astro-compatible** (header JS); needs **AdSense/AdX good standing**; pays ID via Tipalti ($100 Payoneer/Wise ACH, $0 fee, Net 65) [42]. **Primary target.**
- **Ezoic** [43]: **250,000 MAU** (since Feb 2026); smaller sites enter selective **Incubator** (20/mo); Astro via JS/Cloudflare; Google policy required.
- **Monumetric Propel** [44]: 10k–80k PVs/mo, 50% Tier-1, **$99 fee**; **disqualifies Astro** (*"WordPress or Blogger"* only). Ascend needs 80k+ PVs.
- **Raptive** [45]: **25,000 PVs/mo** (50% Tier-1), >=6-mo domain, human content; Astro ok.
- **Others:** **Carbon Ads** (10k+ PVs dev/design) [46], **EthicalAds** (50k+ PVs dev) [47], **Setupad** (100k visits `[Unverified]`), **SHE Media** (20k–50k PVs women's niche mismatch `[Unverified]`), **Media.net** (no published floor, strict US/UK bar `[Unverified]`), **Sovrn** (no floor, low RPM `[Unverified]`). **Avoid Adsterra [48] / Monetag [49] / Infolinks** (0 floor, $5–$50 PayPal/Payoneer): popunders/in-text ads hurt affiliate CRO and Google recovery.

---

## 4. The Math ($200/Month) `[Estimated]`

- **Display RPM (Tier-1 tech):** AdSense **~$8** ($6–$12); Journey **~$16** ($12–$22; tech ranges $8–$33 `[Unverified]`).
- **Affiliate / 1k Visitors:** 10% CTR × 2.0% CR × $200 AOV × 4.0% commission = **$16 / 1k visitors ($0.16 EPC)** (range $10–$25); at 1.2 PVs/visit = **~$13.30 / 1k PVs**.

|Model|Yield / 1k PVs|Monthly PVs for $200|Notes|
|:---|:---|:---|:---|
|**(a) Ads Only**|$8 (AdSense) / $16 (Journey)|**25,000** / **12,500**|Journey needs >=5k Tier-1 sessions first.|
|**(b) Affiliate Only**|$13.30 ($10–$21)|**~15,000** (9.5k–20k)|Zero traffic minimums; fastest early cash.|
|**(c) Mix**|$21.30 (AdSense+Aff) / $29.30 (Journey+Aff)|**~9,400** / **~6,800**|**~230–310 daily PVs** hits $200/mo.|

---

## 5. Ethical Traffic Levers Beyond Google (2026)

- **Bing & ChatGPT Search:** Enable **Cloudflare Crawler Hints** (`Caching > Configuration`) for auto-**IndexNow** [50]; verify **Bing Webmaster Tools** (**AI Performance** citations) [51]. Allow `OAI-SearchBot` and `Bingbot` in `robots.txt` (optionally disallow `GPTBot`) and check **Cloudflare AI Crawl Control** permits them [52, 53]. Put verdict/spec tables high in Astro HTML.
- **Pinterest:** Pin 2:3 desk visuals to **lightscripts.com guides**; direct affiliate pins need `#affiliate` disclosure and no shorteners [54].
- **Reddit:** `r/battlestations` (bans affiliate links/ads [55]), `r/OfficeChairs` (bans affiliate/ad blogs [56]), and `r/MechanicalKeyboards` (strict promo limits [57]) enforce bans. Post native photos/test notes with zero links; name your site only if asked.
- **Facebook Groups:** Better reach than Pages, but admins delete raw links `[Unverified]`; share native insights and link only in promo threads.
- **Threads:** Put guide URLs in the **first reply**, not main body, avoiding suppression `[Unverified]`.
- **YouTube Shorts:** Description/comment links are **non-clickable** [58]; attach Studio's **Related Video** linking to a 3–5 min review (clickable description links) plus your **Channel Profile link** [58].
- **Newsletters:** Embed an Astro signup form (ergonomics/cable checklist). Amazon permits email links **only if solicited/opted-in** [59]; linking to site guides is safer.

---

## 6. 30 / 60 / 90-Day Plan

- **Days 1–30:** Complete Section 1 fixes; enable IndexNow + `OAI-SearchBot`; set up Payoneer + PayPal; join UGREEN, Anker, Keychron, Logitech, Secretlab, FlexiSpot, Branch, Crandall, BenQ. Publish 4–6 photo guides; post 10–15 Pins/wk, Shorts, Threads. **Milestone:** 40+ Bing-indexed pages, **500–1,000 PVs/mo**, **$10–$30 affiliate**. **Kill:** Drop any social channel <50 clicks after 15 posts.
- **Days 31–60:** Publish 8+ photo guides (47–51 total) on desks, chairs, docks, monitors. Join **Amazon Associates US** at ~50–100 clicks/wk; reapply to **AdSense** around Day 45–60 after GSC impression gains. **Milestone:** **2,500–4,500 PVs/mo**, 3 Amazon sales, **$60–$120/mo**. **Kill:** After a 4th AdSense rejection, focus solely on Journey + affiliates; if EPC <$0.05 after 1,000 clicks, rework tables toward $300+ gear.
- **Days 61–90:** Reach 55–60 guides; scale Bing AI citations, Pinterest/YouTube funnels, weekly newsletter. Apply to **Journey** at **5,000 Tier-1 sessions/30d**. **Milestone:** **7,000–10,000 PVs/mo**, **$200+/mo** ($140–$180 affiliate + $40–$80 ads, or $200+ affiliate). **Kill:** If Day-90 <3,000 PVs and <$50/mo, pivot strictly to low-competition "Model A vs B" queries and long-form YouTube demos.

---

## Sources
[1] https://support.google.com/adsense/answer/12176698?hl=en
[2] https://developers.google.com/search/docs/essentials/spam-policies
[3] https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews
[4] https://support.google.com/adsense/answer/9724?hl=en
[5] https://support.google.com/adsense/answer/99376?hl=id
[6] https://community.cloudflare.com/t/google-bots-cannot-reach-website-due-to-robots-txt/368770
[7] https://support.google.com/adsense/answer/1709871?hl=en
[8] https://support.google.com/adsense/answer/3372975?hl=en
[9] https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ
[10] https://affiliate-program.amazon.com/help/node/topic/G7MJTPEP9NC3YKMG
[11] https://affiliate-program.amazon.com/help/node/topic/G8TW5AE9XL2VX9VM
[12] https://affiliate-program.amazon.com/help/node/topic/G8VUMS6GTBCR9RGV
[13] https://affiliate-program.amazon.com/help/node/topic/GKDG94FQSRXSJCGK
[14] https://help.impact.com/other/reference-documentation/supported-currencies-and-timezones.md
[15] https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/finance/payments-withdrawals-and-balance/how-do-partners-get-paid.md
[16] https://www.awin.com/ca/news-and-events/awin-news/awin-shareasale-new-era
[17] https://success.awin.com/s/article/What-are-the-payment-thresholds
[18] https://success.awin.com/s/article/Receiving-payments-via-Payoneer-Local-currency-vs-wire-transfer
[19] https://pubhelp.rakutenadvertising.com/hc/en-us/articles/360059980311-Payment-Options
[20] https://support.partnerstack.com/hc/en-us/articles/360009377934-Configuring-payout-providers
[21] https://www.flexispot.com/affiliate
[22] https://ui.awin.com/merchant-profile/22506
[23] https://www.upliftdesk.com/affiliate/
[24] https://www.branchfurniture.com/pages/affiliate-program
[25] https://signup.cj.com/member/signup/publisher/?cid=5885920
[26] https://www.autonomous.ai/workpod-partner-program
[27] https://secretlab.co/pages/affiliates
[28] https://store.hermanmiller.com/affiliate-signup.html?lang=en_US
[29] https://signup.cj.com/member/brandedPublisherSignUp.do?air_refmerchantid=6052132
[30] https://signup.cj.com/member/signup/publisher/?cid=5491848
[31] https://ui.awin.com/merchant-profile/64096
[32] https://www.logitech.com/en-us/programs/affiliate-program
[33] https://affiliate.keychron.com/program-details/commissions
[34] https://signup.cj.com/member/brandedPublisherSignUp.do?air_refmerchantid=7236824
[35] https://www.elgato.com/ww/en/s/partnerships
[36] https://www.anker.com/become-an-affiliate
[37] https://ai.ugreen.com/pages/affiliate
[38] https://ui.awin.com/merchant-profile/90851/commission-groups
[39] https://satechi.com/pages/ambassador-program
[40] https://archive.caldigit.com/resell/
[41] https://www.mediavine.com/application-requirements/
[42] https://help.mediavine.com/mediavine-payment-methods
[43] https://www.ezoic.com/incubator
[44] https://www.monumetric.com/propel-program/
[45] https://help.raptive.com/hc/en-us/articles/360032840891-Who-is-eligible-for-Raptive
[46] https://www.carbonads.net/
[47] https://www.ethicalads.io/publishers/
[48] https://adsterra.com/publishers/
[49] https://monetag.com/
[50] https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/
[51] https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
[52] https://developers.openai.com/api/docs/bots.md
[53] https://blog.cloudflare.com/introducing-ai-crawl-control/
[54] https://create.pinterest.com/blog/affiliate-marketing-link-basics/
[55] https://www.reddit.com/r/battlestations/
[56] https://www.reddit.com/r/OfficeChairs/
[57] https://www.reddit.com/r/MechanicalKeyboards/wiki/subreddit_rules/
[58] https://support.google.com/youtube/answer/13748639?hl=en
[59] https://affiliate-program.amazon.com/help/operating/policies
