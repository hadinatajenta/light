# Product shopping list for the affiliate catalog

The catalog is empty, so no article can carry an affiliate link yet. This is the
fastest way to fill it.

**Do not scrape Amazon.** Open the product page in your browser, copy the URL,
and paste it into the catalog. The form now reads the ASIN and the name out of
the URL automatically, so one paste per product is enough.

How to add a batch:

1. Open `/dashboard/monetization/catalog`.
2. Click **Bulk import**.
3. Paste one URL per line, for example:

```
https://www.amazon.com/Apple-Magic-Trackpad-Multi-Touch-Surface/dp/B0DL6ZN6GK/ref=sr_1_3
https://www.amazon.com/dp/B08KTN2NSW
```

4. Choose the program (Amazon Associates) and submit. Each line becomes a
   product with a slug and a name derived from the URL.
5. Open any product you want to correct and fix the name, the price, or the
   topics, then save.

## Suggested first batch

Roughly 25 products is enough to put a link in every published guide. Search
for these, take the model you would actually recommend, and paste the URL.

| Search for | Suggested slug | Supports the topic |
| --- | --- | --- |
| Gas spring single monitor arm | `single-monitor-arm-gas-spring` | monitor arm guides |
| Dual monitor arm | `dual-monitor-arm` | two monitor setup |
| Monitor light bar | `monitor-light-bar` | eye strain, desk lamp |
| 27 inch 1440p IPS monitor | `monitor-27-1440p-ips` | monitor guides |
| 24 inch 1080p monitor | `monitor-24-1080p` | small desk setups |
| Ergonomic office chair, mid range | `office-chair-mid-range` | chair sizing |
| Mesh task chair with adjustable seat depth | `office-chair-adjustable-depth` | chair sizing |
| Footrest with height adjustment | `footrest-adjustable` | chair sizing, posture |
| Electric standing desk, dual motor | `standing-desk-dual-motor` | standing desk guide |
| Standing desk mat | `standing-desk-mat` | standing desk guide |
| Under desk cable tray | `cable-tray-under-desk` | cable management |
| Cable management sleeve | `cable-sleeve` | cable management |
| Surge protector with USB | `surge-protector-usb` | cable management, power |
| Laptop stand, aluminium, fixed height | `laptop-stand-aluminium` | laptop stand guide |
| Laptop stand, adjustable | `laptop-stand-adjustable` | laptop stand guide |
| USB-C docking station with power delivery | `usb-c-dock-power-delivery` | dock guide |
| USB-C hub, compact | `usb-c-hub-compact` | dock guide |
| Mechanical keyboard, tactile switches | `mechanical-keyboard-tactile` | keyboard guides |
| Low profile mechanical keyboard | `mechanical-keyboard-low-profile` | keyboard guides |
| Quiet membrane keyboard | `membrane-keyboard-quiet` | quiet keyboard topic |
| Wireless mouse, ergonomic | `mouse-wireless-ergonomic` | mouse topic |
| Over-ear noise cancelling headphones | `headphones-noise-cancelling` | audio guides |
| USB headset with microphone | `headset-usb-microphone` | meeting audio |
| Desk microphone, USB | `microphone-usb-desk` | meeting audio |
| 1080p webcam with autofocus | `webcam-1080p-autofocus` | webcam topic |
| Acoustic panels, pack of 6 | `acoustic-panels-6-pack` | home office noise |
| Desk drawer unit, under desk | `desk-drawer-unit` | under desk storage |
| Anti fatigue mat for standing | `anti-fatigue-mat` | standing desk guide |
| Screen cleaning kit | `screen-cleaning-kit` | monitor care |
| Monitor riser with storage | `monitor-riser-storage` | small desk setups |

## After the first batch

- Open `/dashboard/monetization/catalog` and check the **Needs attention** panel.
  It lists any article that references a product slug which does not exist.
- Open `/dashboard/insights` and watch the **Affiliate readiness** section. The
  share of articles with at least one product link should climb as you work.
- Clicks appear in the same section, and on the dashboard, once readers start
  following the links. Every link goes through `/go/<slug>`, which records the
  click before forwarding to Amazon with the tracking id.

## Note on prices

The catalog has price fields, and they are optional. Amazon prohibits showing a
price that is not kept current, so the site never renders a price from the
catalog. Leave them empty unless you plan to refresh them.
