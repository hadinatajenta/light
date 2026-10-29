# Archive plan: overlapping buying guides

Date: 2026-10-29
Status: proposed, not applied

Reason: 111 articles are published, 34 of them on 2026-10-11, and about 80 are near-variants of the same buying decisions. Google's AdSense help article 81904 flags scaled, low-originality content. The plan archives 50 narrow variants and keeps 61 articles (one strong guide per sub-topic, plus every AI, hardware and comparison article).

Effect of archiving: the article returns 404 on the public site and leaves the sitemap. The row stays in D1 with `status = 'archived'` and can be restored by setting it back to `published`.

Link repair: 22 internal links in 14 kept articles point at archived slugs. They are unwrapped to plain text in the same step so no kept page links to a 404.

## Articles to archive (50)

### Monitors (9)
- `how-to-choose-a-monitor-for-spreadsheets`
- `how-to-choose-a-monitor-arm-for-a-two-monitor-setup`
- `how-to-choose-a-monitor-arm-for-a-heavy-ultrawide-monitor`
- `monitor-calibration-for-non-designers-what-actually-matters`
- `monitor-brightness-and-contrast-for-office-lighting`
- `monitor-height-on-an-arm-eye-line-tilt-and-viewing-distance`
- `portrait-monitor-arm-clearance-what-limits-the-swing`
- `monitor-light-bars-for-dark-months-what-to-check-before-buying`
- `how-to-choose-an-anti-glare-screen-for-a-bright-room`

### Chairs (9)
- `how-to-choose-an-office-chair-for-a-short-or-petite-user`
- `office-chair-casters-wheel-hardness-stems-and-floor-protection`
- `office-chair-gas-lift-and-base-what-to-check-before-buying`
- `refurbished-and-open-box-office-chairs-what-to-check-first`
- `office-chair-warranty-terms-what-is-actually-covered`
- `does-your-office-chair-need-a-headrest-recline-and-neck-fit`
- `office-chair-seat-width-vs-hip-breadth-measure-before-you-buy`
- `office-chair-weight-ratings-what-the-number-covers`
- `how-to-choose-a-desk-chair-for-a-shared-workspace`

### Standing desks (3)
- `standing-desk-height-range-measuring-for-sit-stand-use`
- `standing-desk-mats-what-to-check-before-buying-3`
- `two-leg-vs-four-leg-standing-desks-stability-and-foot-clearance`

### Desks and surfaces (7)
- `desk-surface-materials-laminate-vs-veneer-vs-solid-wood`
- `desk-pad-size-for-a-full-keyboard-and-mouse`
- `corner-desk-for-a-small-room-measure-the-return-depth`
- `choosing-a-desk-for-a-laptop-only-setup-in-a-small-space`
- `how-to-choose-a-desk-for-two-monitors-and-a-laptop`
- `planning-a-desk-upgrade-without-replacing-everything`
- `room-layout-for-a-small-home-office-measure-then-buy`

### Cables and storage (6)
- `desk-cable-trays-clamp-screw-or-adhesive-mounting`
- `cable-raceway-vs-sleeve-vs-spiral-wrap-under-a-desk`
- `keeping-a-desk-tidy-trays-drawers-and-cable-boxes`
- `desk-grommets-and-cable-ports-sizes-to-check-before-buying`
- `how-to-choose-a-filing-cabinet-that-fits-under-a-desk`
- `under-desk-pc-mounts-weight-rating-and-clearance-to-check`

### Keyboards (5)
- `low-profile-vs-standard-keyboards-key-travel-and-wrist-angle`
- `how-to-choose-a-compact-keyboard-for-a-small-desk`
- `keyboard-switch-weight-for-typing-45g-vs-60g-actuation`
- `negative-keyboard-tilt-flat-tilted-back-or-front-up`
- `how-to-reduce-keyboard-noise-in-a-shared-room`

### Audio (7)
- `microphone-placement-for-clear-meeting-audio`
- `cardioid-vs-omni-usb-microphones-which-desk-pattern-to-buy`
- `wired-vs-wireless-headset-for-all-day-calls-weight-and-battery`
- `speaker-placement-for-desk-audio-distance-and-angle`
- `desk-speaker-size-for-nearfield-driver-and-desk-depth`
- `do-desk-speakers-need-stands-or-isolation-pads`
- `how-to-choose-noise-reducing-panels-for-a-home-office`

### Lighting and power (4)
- `task-lighting-vs-ambient-lighting-at-a-desk`
- `laptop-cooling-when-a-stand-is-enough`
- `powered-vs-unpowered-usb-hubs-for-a-desk-what-to-check`
- `surge-protection-for-a-desk-power-planning-and-what-to-buy`

## Kept articles with links to repair (14)

- `how-to-choose-a-standing-desk-for-a-small-home-office` (1)
- `under-desk-storage-what-actually-fits-your-desk` (1)
- `monitor-resolution-and-scaling-for-text-work-a-practical-guide` (1)
- `how-to-choose-a-webcam-for-a-small-home-office` (1)
- `vesa-mount-compatibility-plate-sizes-and-screw-patterns` (2)
- `desk-pad-materials-compared-leather-felt-and-cork` (2)
- `office-chair-armrest-height-and-width-measure-before-buying-2` (2)
- `desk-height-and-keyboard-position-setting-up-for-comfort` (1)
- `monitor-riser-vs-arm-when-a-shelf-beats-an-arm` (3)
- `24-vs-27-inch-monitor-at-60-cm-on-a-shallow-desk` (3)
- `how-to-read-ergonomic-chair-certifications-bifma-en-1335-greenguard` (1)
- `ipad-mini-2026-vs-ipad-air-desk-fit` (1)
- `sony-wh-1000xm6-vs-bose-quietcomfort-ultra-2` (1)
- `uplift-v2-vs-flexispot-e7-pro` (2)

## Apply

1. Run `UPDATE posts SET status = 'archived' WHERE id IN (...)` for the 50 ids above against `light-content`.
2. Unwrap the 22 `[text](/blog/<archived-slug>/)` links in the 14 kept bodies.
3. Run `npm run db:export` so `src/content/blog` matches D1, then `npm run check:links`.
4. Resubmit the sitemap in Search Console.
