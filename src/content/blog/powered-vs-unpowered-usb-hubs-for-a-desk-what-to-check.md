---
title: "Powered vs unpowered USB hubs for a desk: what to check"
description: Bus power is shared and shrinks with every device you add. Size a desk USB hub by per-port current and full-load capacity, not by port count.
status: archived
slug: powered-vs-unpowered-usb-hubs-for-a-desk-what-to-check
tags:
  - usb-hubs
  - desk-accessories
  - power-management
  - cable-management
pubDate: 2026-10-15T15:49:09.417Z
noindex: false
affiliate: false
faq: []
category: accessories
updatedDate: 2026-10-15T16:31:01.959Z
coverUrl: /media/b45a41fb-3f4d-4968-b099-58b16f175a70.jpg
coverAlt: "Powered vs unpowered USB hubs for a desk: what to check"
---

## Quick answer

- Go self-powered (a hub with its own power supply) if you attach an external drive, charge a phone, or run more than two or three devices.
- A bus-powered hub (no power supply) is enough for a mouse, a keyboard and a flash drive.
- Size by per-port current, not port count: seven ports at 500 mA each would need 3.5 A, and many seven-port hubs ship with a 1 A supply.
- Never chain one bus-powered hub into another; the USB specification does not permit it.
- If your hub came with a power adapter, leave it connected at all times.

Most desk hub problems do not announce themselves as power problems. A portable drive drops out mid-backup, a webcam stutters, a keyboard reconnects on its own. Those symptoms often trace back to a hub drawing from the same small power pool as everything else attached to the machine.

The decision is not which hub has the most ports. It is whether the hub has its own supply, how much current each port can really deliver, and whether you need a hub at all or a dock.

## What is the difference between a powered and an unpowered USB hub?

Spec sheets use the terms self-powered and bus-powered. A self-powered device takes all of its power from an external power supply and has its own wall adapter. A bus-powered device takes all of its power from the host computer's USB interface, which on a desk means your laptop. Those definitions come from Plugable's knowledge base, and the distinction decides whether your hub competes with the rest of the machine for power.

The competition is real. Because bus-powered devices draw from the host, every device added reduces the total bus power still available. Plugable warns that if that pool runs out, any attached USB device may disconnect suddenly, and for a storage device that can mean permanent data loss. On a desk with a drive attached, that warning is the whole argument for a powered hub.

The table below compares the two classes on the points that matter at a desk.

| Hub class | Power source | Per-port budget | Suits |
| --- | --- | --- | --- |
| Self-powered | External power supply | 500 mA per port (USB 2.0); 900 mA (USB 3.0) | External drives, charging, six or more devices |
| Bus-powered | The host computer's USB port | One shared pool that shrinks with each device added | Keyboard, mouse, flash drive |

A milliamp (mA) is one thousandth of an amp, so 500 mA is half an amp.

One rule is worth knowing before you shop. The USB compliance specification prohibits Y-cables (cables with two A-plugs) and states that a peripheral needing more power than its class allows must be self-powered. A product that relies on a dual-plug cable is working around the standard rather than solving your problem.

## How many USB ports do you actually need?

Count the devices that stay plugged in, then look at what each one is allowed to draw. In USB 2.0 one unit load, the current step a port is specified in, is 100 mA, and a device may draw at most five unit loads, or 500 mA, from a port. In USB 3.0 one unit load is 150 mA and the cap is six unit loads, or 900 mA.

The table below shows what a single port can deliver under each standard, alongside the separately specified charging-port class.

| Standard | One unit load (mA) | Maximum per port (mA) |
| --- | --- | --- |
| USB 2.0 | 100 | 500 |
| USB 3.0 | 150 | 900 |
| Charging port (BC 1.1) | — | 500 to 1,500 |

The arithmetic gets uncomfortable fast. A bus-powered hub draws its entire allowance from one host port, so two devices that each negotiate the full 500 mA would consume that port's whole USB 2.0 budget before the hub's own consumption is counted. Seven ports at the maximum USB 2.0 draw would need 3.5 A plus power for the hub itself, yet many seven-port hubs ship with a 1 A supply. The designers assume most attached devices are low power, which holds until a drive shows up.

The number to look for, then, is not the port count but how many ports can drive a full 500 mA load at the same time. Some manufacturers print it. Wikipedia notes packaging on a seven-port hub claiming support for a maximum of four full-load devices, which tells you the other three are for keyboards and cables rather than bus-powered drives.

Charging is a separate port class. The USB Battery Charging Specification Revision 1.1 (2007) defines charging ports that supply 500 mA to 1.5 A without digital negotiation, where a standard downstream port will not exceed 100 mA until it has negotiated with the host. If a hub advertises fast charging, check whether those ports also carry data.

Nor can you hang a second unpowered hub off the first to reach more ports. The USB specification requires that bus-powered hubs are not connected in series with other bus-powered hubs.

## Do you need a USB hub or a docking station?

A hub adds ports. A dock adds ports plus video, and usually wired networking. That split matters most when a monitor is involved, because on a USB-C system video output depends on an optional feature of the host.

Alt Mode (an optional USB-C function that lets the port carry a video signal alongside data) is not implemented by every manufacturer. Plugable notes that a host lacking it is a hardware limitation with no workaround short of DisplayLink, a technology that drives a display over ordinary USB data rather than a dedicated video lane. Confirm Alt Mode support in the system specifications or the manual before buying a hub to feed a screen. Without it, the hub remains a good port expander and still cannot drive your monitor.

Reach is the other split. A hub can act as an active USB repeater, extending cable length in 5 metre (16 foot) segments at a time, which is how a hub on the far corner of a long desk works where one passive cable will not; the older 3 metre limit applies to low-speed USB 1.1 cabling, a separate case.

## How do you check a hub's power claims before you buy?

A hub's own description of itself is not evidence. There are many non-compliant hubs on the market that announce themselves to the host as self-powered despite really being bus-powered. That misreporting makes faults harder to diagnose, because the operating system reports a powered device while the real limit is still your laptop's shared pool.

Three checks are worth the time. Look for a named USB-IF certification with a test ID (TID, the number USB-IF assigns to a certified product), which you can verify against the USB-IF integrators list; VIA Labs, for example, announced USB-IF USB 2.0 Hub certification for its VL122 hub controller under TID 14201. Then find the full-load port count where the manufacturer states one, since a declared figure of four full-load ports on a seven-port hub is the honest capacity. Finally, read the adapter instruction: many hubs that include a power adapter can run in either self-powered or bus-powered mode, but Plugable states the adapter should remain connected at all times, otherwise the hub may not function as designed.

## What to check before you buy

- List the devices that stay connected, and mark the ones that must never drop during use.
- Add up the per-port current they are allowed to negotiate and compare it with the hub's full-load port count.
- Confirm the power class, and if an external supply is included, plan to keep it plugged in.
- Check whether fast-charge ports carry data or only power.
- Look for a USB-IF certification and TID where the brand publishes one.
- Measure the run from host to hub; a hub can repeat the signal in 5 metre segments.
- If a monitor is part of the plan, confirm Alt Mode in the host first.

## If the free fixes are not enough

Try the free version before buying: plug the drive straight into a host port, unplug what you are not using, check that the hub's adapter is connected, and spread the load across the machine's own ports. If the symptoms survive that, the table below matches your situation to the fix.

| Your situation | What answers it |
| --- | --- |
| An external drive disconnects mid-write when it shares a hub | A self-powered hub, or the drive plugged directly into the host |
| Six or more devices that stay plugged in | A self-powered hub with a supply sized for the ports you will load |
| The stated full-load count is lower than the number of ports you need to fill | A hub with a higher full-load port count, or two hubs on separate host ports |
| A monitor and the peripherals need to run from one cable | A dock, or a USB-C hub whose host supports Alt Mode, confirmed in the manual |

## Sources and further reading

Plugable's knowledge base, on self-powered versus bus-powered devices and on USB-C Alt Mode. Wikipedia's entry on USB hubs, for the compliance notes, packaging disclosure and repeater behaviour. A Champway technical note on USB power, for unit loads, the Y-cable prohibition and charging ports. VIA Labs' announcement of USB-IF certification for the VL122 hub controller. Standards referred to: the USB specification and the USB Battery Charging Specification Revision 1.1 (2007).
