---
title: "Monitor resolution and scaling for text work: a practical guide"
description: "Monitor resolution and scaling decide whether text looks crisp: how pixel density, viewing distance and OS scaling interact from 24 to 32 inches."
status: published
slug: monitor-resolution-and-scaling-for-text-work-a-practical-guide
tags:
  - monitors
  - desk-setup
  - resolution-scaling
pubDate: 2026-10-11T02:31:50.196Z
noindex: false
affiliate: false
faq:
  - question: Is 27-inch 1440p too low a density for text?
    answer: At 108.8 ppi, a 16-pixel interface font gives capitals around 2.6 mm, under the 2.9 mm minimum the ETSI guide cites for 400 to 600 mm. It is usable. For long documents at 60 cm, raise the editor font to 20 or 22 pixels.
  - question: Does 150 percent scaling on a 4K monitor reduce sharpness?
    answer: No, for text in applications that redraw at the new scale. Sharpness drops for applications without per-monitor DPI support, and for stretched bitmap artwork.
  - question: Why is text blurry on my second monitor?
    answer: The screens are probably at different scales, and the application is being bitmap stretched as it moves between them. Compare logical ppi and set the scales within about 10 percent.
  - question: Is a 24-inch 1080p monitor still reasonable for text?
    answer: "Yes. At 91.8 ppi it gives 3.1 mm capitals at 100 percent, inside the recommended band at 60 cm. Its limit is workspace: 1920 by 1080 leaves little room for two documents side by side."
  - question: Should I buy 27-inch 4K or 32-inch 4K?
    answer: Choose by the workspace and text size you want, then check the scale. A 27-inch 4K at 150 percent behaves like a 27-inch 1440p with finer strokes. A 32-inch 4K at 150 percent behaves like a 24-inch 1080p enlarged.
category: monitors
updatedDate: 2026-10-27T06:10:12.972Z
coverUrl: /media/1d8ff1ec-a61f-4bf4-8149-1f2d20544aae.jpg
coverAlt: "Monitor resolution and scaling for text work: a practical guide"
focusKeyword: monitor resolution and scaling
---

Most desk purchases are decided by feel. A monitor is decided by arithmetic. Monitor resolution and scaling fix how large a character appears, how much of a spreadsheet fits, and whether the edge of that character is clean. Both are settled when you pick a size and a panel.

Resolution belongs to the panel. Scaling belongs to the operating system.

## Native resolution is the only mode that maps one pixel to one pixel

A 27-inch 4K panel has 3840 columns and 2160 rows. Any other resolution is resampled onto that grid, so detail that would have landed on one pixel lands across two. Apple's high-resolution documentation describes the split: applications draw in points, and "the window server scales the content appropriately, mapping points to onscreen pixels".

Two equations carry the rest:

- logical width = native width divided by scale
- logical ppi = panel ppi divided by scale

Logical ppi is what your eyes respond to. It sets how large a 16-pixel font appears and how much document fits. A dense panel with no scaling gives tiny text; a coarse one with heavy scaling gives little workspace.

## Pixel density is the number that predicts text quality

Pixels per inch is the diagonal in pixels divided by the diagonal in inches. A 27-inch 2560 by 1440 panel works out at 108.8 ppi. A 27-inch 3840 by 2160 panel works out at 163.2 ppi.

Published spec sheets put a 27-inch 4K panel at a 0.155 mm pitch and 163 ppi, and a 27-inch 1440p panel at 0.233 mm and 109 ppi.

| Panel | Pixels | PPI | Pitch | At 100% | At 150% |
| --- | --- | --- | --- | --- | --- |
| 24-inch 1080p | 1920 x 1080 | 91.8 | 0.277 mm | 91.8 | 61.2 |
| 27-inch 1440p | 2560 x 1440 | 108.8 | 0.233 mm | 108.8 | 72.5 |
| 27-inch 4K | 3840 x 2160 | 163.2 | 0.156 mm | 163.2 | 108.8 |
| 32-inch 4K | 3840 x 2160 | 137.7 | 0.185 mm | 137.7 | 91.8 |

## Worked examples: four panels on one desk

Assume a 60 cm viewing distance, a 16-pixel interface font, and capitals at about 70 percent of the pixel height.

**24-inch 1080p.** 91.8 ppi, 0.277 mm pitch. At 100 percent, one logical pixel is 4.6 percent wider than the 0.265 mm a 96 dpi reference assumes. Capitals land near 3.1 mm. The [24-inch versus 27-inch comparison](/blog/24-vs-27-inch-monitor-at-60-cm-on-a-shallow-desk/) covers the desk-depth side.

**27-inch 1440p.** 108.8 ppi, 0.233 mm pitch. The same font gives 2.6 mm capitals, or 15.0 minutes of arc at 600 mm. It has fewer pixels per letter than the smaller panel, because the screen grew faster than the pixel count.

**27-inch 4K.** 163.2 ppi, 0.156 mm pitch. At 100 percent the capitals are 1.7 mm, too small for sustained reading. At 150 percent the logical density is 108.8 ppi, exactly the 1440p case, so capitals return to 2.6 mm, and each letter is drawn with 1.5 times as many pixels across. Same layout, finer strokes. At 175 percent the logical density is 93.2 ppi and capitals reach 3.05 mm.

**32-inch 4K.** 137.7 ppi, 0.185 mm pitch. At 150 percent the logical density is 91.8 ppi, matching a 24-inch 1080p at 100 percent almost exactly. Bigger screen, identical text.

## Monitor resolution and scaling: the workspace at 100, 125, 150 and 200 percent

Workspace is native resolution divided by scale.

| Panel | 100% | 125% | 150% | 200% |
| --- | --- | --- | --- | --- |
| 27-inch 4K | 3840 x 2160 | 3072 x 1728 | 2560 x 1440 | 1920 x 1080 |
| 27-inch 1440p | 2560 x 1440 | 2048 x 1152 | 1707 x 960 | 1280 x 720 |
| 24-inch 1080p | 1920 x 1080 | 1536 x 864 | 1280 x 720 | 960 x 540 |

150 percent on a 27-inch 4K gives exactly the workspace of a 27-inch 1440p, so 4K buys stroke quality rather than desk space. 125 percent costs a fifth of the width. And 200 percent on 4K returns you to 1080p workspace, which is how buyers pay for 4K and end up with less room than before.

Windows marks one scale entry as recommended. macOS labels its scaled modes by the desktop size they imitate.

## Viewing distance decides how large a character has to be

Millimetres alone say little: 2.6 mm is comfortable at 40 cm and small at 80 cm. Ergonomics measures the angle a character subtends at the eye, in minutes of arc.

ETSI's human factors guide, deriving its table from ISO 9241-3, recommends a capital subtending 20 to 22 minutes at the intended reading distance, gives a maximum viewing distance at 16 minutes, and notes that for a 400 to 600 mm reading distance, sources put the minimum letter height at 2.9 mm and the optimum at 3.8 to 4.5 mm. ISO 9241-303:2011 sets image-quality requirements as generic performance specifications rather than fixed sizes.

| Capital | Preferred distance | Maximum distance |
| --- | --- | --- |
| 2.4 mm | 375 to 413 mm | 516 mm |
| 2.8 mm | 438 to 481 mm | 602 mm |
| 3.6 mm | 563 to 619 mm | 774 mm |
| 4.4 mm | 688 to 757 mm | 946 mm |
| 5.0 mm | 782 to 860 mm | 1075 mm |

At 600 mm, 20 minutes equals 3.49 mm of capital height. That is the figure for the document or code you read all day.

A 27-inch 1440p at 100 percent gives 2.6 mm capitals, 15.0 minutes at 600 mm, below both the floor and the preferred angle. A 27-inch 4K at 200 percent gives 3.49 mm, almost exactly 20 minutes. The same 4K at 150 percent matches the 1440p panel.

## Why fractional scaling softens text

Only integer scale factors put every logical pixel on a whole number of device pixels. 200 percent does: one logical pixel becomes two across and two down. 125, 150 and 175 do not, so at 150 percent a one-pixel border has to be drawn across a pixel boundary.

Modern applications redraw at the larger size. Text is rasterised at 24 device pixels instead of 16, which is sharper. The blur appears elsewhere. Microsoft's high DPI guidance explains that applications without per-monitor awareness are "DPI unaware", render at a fixed 96 dpi, and get their bitmap stretched, so they "appear blurry".

Compositors choose differently. GNOME scales the monitor framebuffer, rendering the desktop at a higher resolution and downsampling, which keeps layouts consistent. GNOME 47 still calls its improved fractional scaling "experimental".

For crisp text above 100 percent, pick a panel whose density reaches 200 percent at the workspace you need.

## macOS scaled modes are not the same as Windows percentages

Windows asks applications to render at the percentage you choose. Apple fixes the backing scale factor at "either 1.0 or 2.0", and calls that whole-number constraint "another key feature of high resolution".

A "looks like 1920 by 1080" mode on a 3840 by 2160 panel is exactly 2.0, so nothing is resampled. A "looks like 2560 by 1440" mode needs a 5120 by 2880 backing store, later reduced to 3840 by 2160, and that reduction softens fine strokes. Apple notes that "using a scaled resolution may affect performance".

A 2560 by 1440 panel hits the constraint from the other side. The only 2.0 mode is 1280 by 720, too coarse for most work, so usable modes run at 1.0 and the density buys nothing.

## Mixed-DPI desks: match logical density, not scale percentage

Two screens with different densities need scales that land on similar logical ppi, or text jumps at the boundary.

| Display | Scale | Logical ppi | Pairs with |
| --- | --- | --- | --- |
| 27-inch 4K | 150% | 108.8 | 27-inch 1440p at 100% |
| 27-inch 4K | 175% | 93.2 | 24-inch 1080p at 100% (91.8) |
| 32-inch 4K | 150% | 91.8 | 24-inch 1080p at 100% |

On Windows, per-monitor awareness lets an application redraw at the new scale. Older frameworks do not always manage it. Microsoft lists "multiple-monitor setups where each display has a different scale factor" among the cases where DPI changes mid-session.

On macOS each display keeps its own backing store, and ownership transfers once more than 50 percent of a window sits on the other screen. Keep logical ppi within about 10 percent on both.

## How to check pixel density before you buy

1. Find the native resolution, not the supported list. A monitor that "supports 3840 by 2160" may be a 1440p panel accepting a 4K signal.
2. Divide the diagonal in pixels by the diagonal in inches.
3. Check pixel pitch on the spec sheet. 0.155 mm and 0.233 mm are the common 27-inch figures, and they correspond to 163 and 109 ppi.
4. Divide ppi by your intended scale, then compare with 96 on Windows or 2.0 on a Mac.

A 27-inch 4K at 150 percent gives 108.8 logical ppi, comfortable but no roomier than 1440p. A 32-inch 4K at 100 percent gives 137.7, uncomfortably small for many readers.

Brightness and contrast decide how the panel feels after a long day, and the [office lighting guide](/blog/monitor-brightness-and-contrast-for-office-lighting/) covers that half. Density is the part you cannot change later. Panel type, stand range and ports belong to the [home office monitor guide](/blog/how-to-choose-a-monitor-for-a-home-office/).

## Frequently asked questions

### Is 27-inch 1440p too low a density for text?

At 108.8 ppi, a 16-pixel interface font gives capitals around 2.6 mm, under the 2.9 mm minimum the ETSI guide cites for 400 to 600 mm. It is usable. For long documents at 60 cm, raise the editor font to 20 or 22 pixels.

### Does 150 percent scaling on a 4K monitor reduce sharpness?

No, for text in applications that redraw at the new scale. Sharpness drops for applications without per-monitor DPI support, and for stretched bitmap artwork.

### Why is text blurry on my second monitor?

The screens are probably at different scales, and the application is being bitmap stretched as it moves between them. Compare logical ppi and set the scales within about 10 percent.

### Is a 24-inch 1080p monitor still reasonable for text?

Yes. At 91.8 ppi it gives 3.1 mm capitals at 100 percent, inside the recommended band at 60 cm. Its limit is workspace: 1920 by 1080 leaves little room for two documents side by side.

### Should I buy 27-inch 4K or 32-inch 4K?

Choose by the workspace and text size you want, then check the scale. A 27-inch 4K at 150 percent behaves like a 27-inch 1440p with finer strokes. A 32-inch 4K at 150 percent behaves like a 24-inch 1080p enlarged.

## Sources and further reading

- [Microsoft Learn: High DPI desktop application development](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows)
- [Apple Support: Change your Mac display's resolution](https://support.apple.com/en-us/guide/mac-help/mchl86d72b76/mac)
- [Apple Developer: High Resolution Guidelines for OS X](https://developer.apple.com/library/archive/documentation/GraphicsAnimation/Conceptual/HighResolutionOSX/Explained/Explained.html)
- [GNOME 47 release notes](https://release.gnome.org/47/)
- [ETSI EG 202 116 V1.2.1, character size and viewing distance](https://www.etsi.org/deliver/etsi_eg/202100_202199/202116/01.02.01_60/eg_202116v010201p.pdf)
- [EIZO EV2785, 27-inch 4K specifications](https://www.eizo.com/products/flexscan/ev2785/index.html)
- [EIZO EV2795, 27-inch 1440p specifications](https://www.eizo.com/products/flexscan/ev2795/index.html)
