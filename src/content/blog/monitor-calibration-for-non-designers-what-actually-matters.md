---
title: "Monitor calibration for non-designers: what actually matters"
description: A practical guide to gamma, white point and Delta E, plus which colour specs on a monitor spec sheet are worth paying for.
status: archived
slug: monitor-calibration-for-non-designers-what-actually-matters
tags:
  - monitors
  - monitor-calibration
  - colour
  - home-office
pubDate: 2026-10-11T00:00:00.000Z
noindex: false
affiliate: false
faq: []
category: monitors
updatedDate: 2026-10-11T05:18:47.981Z
coverUrl: /media/69cb27af-c1b9-4c65-819a-9bc0fd0fcd9d.jpg
coverAlt: "Monitor calibration for non-designers: what actually matters"
---

## Calibration solves a specific problem, and you may not have it

An uncalibrated monitor rarely looks broken. It looks normal, just slightly different from the file behind it. Whether that difference costs you anything depends on what you do with the screen.

Calibration earns its keep when colour has to match something outside your computer: a print proof, a brand palette shared across a team, a client's reference image, the same photograph on a colleague's display. If you retouch photos or sign off on colour where two screens must agree, calibration is what makes agreement possible.

For email, documents, spreadsheets and video calls, a monitor running sRGB at gamma 2.2 with a sensible brightness is usually good enough. A screen at an awkward height or angled away from your eyeline changes perceived colour more than a small Delta E difference does, and fixing that costs nothing.

What calibration cannot do is exceed the panel. It brings a monitor to the standard the panel is capable of, no further. It cannot widen a narrow gamut, even out an uneven backlight, or lift a low contrast ratio. If the hardware falls short, the calibration report shows the shortfall rather than disguising it.

## Three targets and one profile

Gamma controls how midtones sit between black and white. The sRGB standard, IEC 61966-2-1, specifies gamma 2.2, which is the right target for nearly all web and office work.

White point is the colour of pure white. D65, roughly 6500K, is the reference for sRGB and most photo and video work. If your screen's white looks warmer or cooler than paper under your desk lamp, that is a white point problem rather than a brightness one.

Brightness is the setting people get wrong most often, because brighter sells in a showroom and hurts at 11pm. Print matching workflows typically sit near 120 cd/m² so screen and paper under a viewing light agree. Web and office work usually wants more, roughly 160 to 250 cd/m² depending on room light.

The output is an ICC profile, maintained by the International Color Consortium, which describes your display's measured behaviour. Operating systems and colour-managed applications read it and translate colours accordingly. Without it loaded, the measurements achieve nothing.

## Hardware calibration versus software calibration

Software calibration writes corrections to your graphics card's lookup table. It is cheap and often bundled with a colorimeter. Graphics card LUTs are commonly 8-bit, though, and heavy correction at low bit depth can band gradients. The profile also sticks to one computer, so a second machine or a different video input sees the uncalibrated panel.

Hardware calibration writes the correction into the monitor's internal LUT, so it travels with the display. A deeper internal LUT (10-bit, 14-bit, 16-bit) lets the calibration apply finer adjustments before banding appears. Manufacturer documentation should state the LUT bit depth. If it does not, treat the hardware calibration claim cautiously.

Two traps are worth checking before you spend. Some monitors accept only a specific colorimeter or only the maker's software, so confirm your hardware is supported. On USB-C models, full colour depth and calibration are not guaranteed across every port or cable, so verify the one you intend to use carries the full signal.

## Reading the spec sheet

Delta E measures how far a displayed colour sits from its intended value, and lower is better. A Delta E (CIEDE2000) below 2 is commonly cited as good enough for professional work. Two details matter as much as the number: whether it is an average or a maximum, and which formula produced it. A maximum under 2 is a much stronger claim than an average under 2, and the older CIE76 and CIE94 formulas are not directly comparable to CIEDE2000. A sheet quoting "Delta E \< 2" without naming the formula is telling you less than it appears to.

Gamut claims need the same scrutiny. Coverage describes how much of a colour space's area the monitor reaches; volume describes how much of the three-dimensional colour solid it reproduces. A monitor can show 100% sRGB coverage while its volume exceeds 100%, so "100% sRGB" without a qualifier is ambiguous. Note which space is cited too: sRGB and Rec. 709 are close relatives, while Adobe RGB and DCI-P3 are wider and ask more of the panel.

Bit depth decides how smoothly gradients render. True 8-bit is fine for most work. 6-bit panels using FRC, frame rate control, simulate extra steps by alternating pixels quickly, which can dither dark gradients and skin tones. 10-bit panels are smoothest. Panel type matters too: IPS generally beats TN and VA on colour and viewing angles, which is why it dominates colour-critical work.

"Factory calibrated" deserves scepticism. A certificate proves the panel met a target at the factory, on one input, in one mode, at one moment. It says nothing about shipping or about next year, and may cover only a single picture preset. Check the reported Delta E values and plan to recalibrate periodically. Words like "professional" and "creator" are not standardised. Uniformity is the spec most often left out: brightness and colour can drift between centre and corner, so look for independent measurements rather than a marketing bullet.

## HDR, response time, and specs that rarely matter here

HDR is the easiest place for a spec sheet to mislead. Any panel can carry an HDR label. The VESA DisplayHDR programme sets real tiers, from DisplayHDR 400 through 500, 600, 1000, 1400 and True Black, and each tier defines minimum peak brightness, local dimming behaviour, colour gamut and bit depth. DisplayHDR 400 is a low bar that mostly signals the panel accepts an HDR signal.

Calibrating for HDR is not the same as calibrating for SDR, and not every package supports it. Confirm both the monitor and the software handle HDR calibration if you intend to use it.

Response time, quoted as grey-to-grey milliseconds, describes how quickly pixels change state. It matters for competitive gaming and little else here, and quoted figures rarely reflect real-world behaviour anyway.

## The cheap fixes that change what you see

Before buying a colorimeter, deal with the two environmental factors that alter perceived colour most.

Ambient light falling on the screen lifts black levels and shifts apparent contrast, which is why a matte panel near a bright window looks grey and flat at midday. A monitor arm helps: it lets you push the panel out of a reflection, angle it perpendicular to your line of sight, and hold a consistent height so you view it near normal incidence. Even on IPS, colour shifts as you move off-axis. A dual arm such as the MOUNTUP Dual Monitor Desk Mount keeps two panels aligned at matching height and angle, which makes side-by-side comparison of the same file far more reliable.

Lighting matters too. A desk lamp aimed at the screen rather than the desk creates glare and changes how you read colour. Light the work surface and keep the screen out of the beam.

## Buying checklist

* Where possible, check independent measurements for colour accuracy and uniformity rather than relying on the manufacturer's summary alone.
* Find the Delta E figure and note whether it is average or maximum and which formula was used. Treat an unqualified "Delta E \< 2" as incomplete.
* Check gamut claims for the colour space and for whether the number refers to coverage or volume.
* Verify the panel is true 8-bit or 10-bit, not 6-bit plus FRC.
* Confirm hardware calibration support, the internal LUT bit depth, and which colorimeters and software are compatible.
* Check that the port and cable you plan to use carry full colour depth.
* If you need HDR, look for a VESA DisplayHDR tier rather than the word "HDR".
* Confirm the monitor can be calibrated to gamma 2.2 and D65 and produces a loadable ICC profile.
* Budget for a colorimeter if you will recalibrate periodically. A factory certificate is a starting point, not a permanent guarantee.
* Before buying anything, reposition the screen: move it away from glare, set the top of the panel near eye level, and judge the colours from there.

## Sources and further reading

* IEC 61966-2-1, the sRGB standard, for gamma and white point targets.
* International Color Consortium (ICC), for how ICC profiles are created and applied.
* VESA DisplayHDR, for certification tiers and their minimum requirements.
* CIE, for the definition of Delta E and the CIEDE2000 formula.
* Adobe RGB (1998), SMPTE RP 431-2 for DCI-P3, and ITU-R BT.709 and BT.2020 for colour space definitions.
* Manufacturer documentation for panel bit depth, internal LUT depth, and colorimeter compatibility.
