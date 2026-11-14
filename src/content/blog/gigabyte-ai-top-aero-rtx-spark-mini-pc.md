---
title: "Gigabyte AI TOP AERO: What the RTX Spark Mini PC Is For"
description: "Gigabyte AI TOP AERO puts NVIDIA RTX Spark and up to 128GB of unified memory in a 1-liter Windows box. What it runs, its limits, and how it rivals DGX Spark."
seoTitle: "Gigabyte AI TOP AERO: What the RTX Spark Mini PC Is For"
status: published
slug: gigabyte-ai-top-aero-rtx-spark-mini-pc
tags:
  - mini-pc
  - nvidia
  - gigabyte
  - ai-hardware
  - desk-setup
pubDate: 2026-11-14T13:30:00.000Z
noindex: false
affiliate: false
faq:
  - question: "What is the Gigabyte AI TOP AERO?"
    answer: "A roughly 1-liter Windows 11 mini PC that GIGABYTE launched on November 10, 2026. It uses NVIDIA's RTX Spark N1X superchip, with a 20-core Grace CPU and a 6,144-core Blackwell GPU, plus up to 128 GB of unified memory, up to 4 TB of PCIe Gen5 storage, 10GbE and Wi-Fi 7, according to GIGABYTE's press release."
  - question: "How much does the Gigabyte AI TOP AERO cost?"
    answer: "GIGABYTE has not announced a price. It says regional configurations, pricing and availability will come from local GIGABYTE announcements. For context, Microsoft's 128 GB Surface RTX Spark Dev Box lists at $5,999.99, according to Starry Hope."
  - question: "What is the difference between RTX Spark and DGX Spark?"
    answer: "DGX Spark uses NVIDIA's GB10 chip with DGX OS (Linux), 273 GB/s of memory bandwidth and ConnectX-7 networking for linking two units. RTX Spark runs Windows 11 on Arm, NVIDIA's porting guide lists 300 GB/s, and the AERO lists 10GbE without ConnectX-7. Both pair a 20-core Grace CPU with a 6,144-core Blackwell GPU and up to 128 GB of memory."
  - question: "Is RTX Spark good for gaming?"
    answer: "Partly. Notebookcheck found the N1X GPU comparable to powerful RTX 5070 versions, and DLSS 5 works in supported games. But it runs Windows on Arm, many games rely on emulation, and F1 25 and Battlefield 6 did not run in Notebookcheck's tests. Treat gaming as a bonus."
  - question: "Is RTX Spark Arm or x86, and can it run Linux?"
    answer: "It is Arm: the CPU uses Cortex-X925 and Cortex-A725 cores on Armv9.2, and x64 Windows apps run through Microsoft's Prism emulation. The AERO ships with Windows 11. NVIDIA has not documented a Linux or DGX OS option for RTX Spark in the sources for this guide, although Microsoft's RTX Spark Dev Box offers WSL2 with GPU passthrough."
category: desk-setup
updatedDate: 2026-11-14T13:30:00.000Z
coverUrl: /media/2e26674f-799d-4bc8-865b-66c17d6c8703.jpg
coverAlt: "Gigabyte AI TOP AERO RTX Spark mini PC cover with the product photo beside the headline"
focusKeyword: "gigabyte ai top aero"
targetIntent: commercial
---

The Gigabyte AI TOP AERO is a mini PC of about one liter, built on NVIDIA's RTX Spark N1X superchip and running Windows 11. GIGABYTE launched it on November 10, 2026, with up to 128 GB of unified memory and up to 4 TB of PCIe Gen5 storage, according to the [press release reposted by TechPowerUp](https://www.techpowerup.com/354649/gigabyte-launches-the-ai-top-aero-powered-by-nvidia-rtx-spark). There is no price, ship date, full port list or independent review yet, and we have not tested it. What we can do is separate what GIGABYTE has confirmed from what early tests of other RTX Spark devices show, and that is enough to decide whether this box belongs on your desk or on a watch list.

## Quick answer

- The Gigabyte AI TOP AERO is a local-AI workstation that can also run games, not a gaming PC that happens to do AI.
- It pairs a 20-core NVIDIA Grace CPU with a 6,144-core Blackwell GPU and up to 128 GB of LPDDR5X shared between them.
- It is not the AI TOP ATOM. The ATOM uses the GB10 chip, runs DGX OS (Linux) and has ConnectX-7. The AERO runs Windows 11 on Arm and lists 10GbE.
- Memory bandwidth is the main limit: NVIDIA lists 300 GB/s for RTX Spark, against 614 GB/s for a Mac Studio with M5 Max.
- Price, configurations, dimensions and power supply are unpublished. Wait for a price and a first review.

![Gigabyte AI TOP AERO press visual showing two units with the Your Personal AI Studio tagline and NVIDIA RTX Spark branding](/media/4f2d907e-2e64-449f-8161-0e21812ad2e5.jpg)

*Image source: [GIGABYTE](https://www.techpowerup.com/354649/gigabyte-launches-the-ai-top-aero-powered-by-nvidia-rtx-spark) press visual via TechPowerUp.*

## Gigabyte AI TOP AERO specs at a glance

GIGABYTE's announcement gives the headline numbers and leaves the practical ones blank. Where NVIDIA publishes a platform figure, we credit NVIDIA rather than GIGABYTE.

| Spec | Gigabyte AI TOP AERO |
| --- | --- |
| Chip | NVIDIA RTX Spark N1X superchip |
| CPU | 20-core NVIDIA Grace: 10 Cortex-X925 and 10 Cortex-A725 cores, Armv9.2 |
| GPU | Blackwell RTX, 6,144 CUDA cores, 5th-gen Tensor and 4th-gen RT cores |
| AI performance | Up to 1 petaflop FP4 (NVIDIA platform figure) |
| Memory | Up to 128 GB LPDDR5X unified, 256-bit |
| Memory bandwidth | Not stated by GIGABYTE; NVIDIA lists 300 GB/s for RTX Spark |
| Storage | Up to 4 TB PCIe Gen5 SSD |
| Networking | 10GbE and Wi-Fi 7; Bluetooth not stated by GIGABYTE |
| Ports | USB Type-C mentioned; full list not stated by GIGABYTE |
| Size and weight | About one liter; dimensions and weight not stated by GIGABYTE |
| Power supply | Not stated by GIGABYTE; NVIDIA lists 140 W TDP for the desktop N1X |
| Operating system | Windows 11 on Arm |
| Price | Not stated by GIGABYTE |

The "up to" wording on memory and storage implies several configurations, but none are listed, so a 64 GB Gigabyte AI TOP AERO is unconfirmed. The 1 petaflop figure is theoretical FP4 that Microsoft describes as including sparsity, according to [StorageReview](https://www.storagereview.com/review/microsoft-surface-laptop-ultra-for-business-review-rtx-spark-n1x), so dense throughput is lower.

## RTX Spark mini PC vs DGX Spark: untangling the names

NVIDIA announced RTX Spark with Microsoft at GTC Taipei at the start of June 2026 as a superchip for Windows PCs, per the [NVIDIA newsroom](https://nvidianews.nvidia.com/news/nvidia-microsoft-windows-pcs-agents-rtx-spark). The N1X desktop part matches the class of the GB10 chip inside DGX Spark: a 20-core Grace CPU, a 6,144-core Blackwell GPU, up to 128 GB on a 256-bit bus, and about one petaflop of FP4.

DGX Spark runs DGX OS, based on Ubuntu; RTX Spark runs Windows 11 on Arm. NVIDIA's [RTX Spark porting guide](https://docs.nvidia.com/rtx-spark/rtx-spark-porting-guide/latest/overview.html) lists 300 GB/s of bandwidth, against 273 GB/s on the [DGX Spark page](https://www.nvidia.com/en-us/products/workstations/dgx-spark/). GB10 machines include ConnectX-7 at 200 Gbps for linking two units. Neither GIGABYTE's AERO announcement nor NVIDIA's RTX Spark specification page lists it.

### Gigabyte AI TOP AERO vs AI TOP ATOM

GIGABYTE sells two AI TOP mini PCs that look almost identical in renders. The AI TOP ATOM, launched in October 2025, is GIGABYTE's GB10 box and its DGX Spark equivalent. The AERO is the Windows sibling on RTX Spark.

![GIGABYTE AI TOP ATOM, the GB10-based DGX OS mini PC, in a marketing render on a desk; this is the ATOM, not the AI TOP AERO](/media/7f442f21-f697-40b9-b668-f3a69010a81c.jpg)

*Image source: [GIGABYTE](https://www.cnx-software.com/2025/10/23/gigabyte-ai-top-atom-an-nvidia-gb10-desktop-ai-supercomputer-with-1-petaflop-ai-10gbe-128gb-ram/) via CNX Software.*

| | AI TOP AERO | AI TOP ATOM | NVIDIA DGX Spark |
| --- | --- | --- | --- |
| Chip | RTX Spark N1X | GB10 | GB10 |
| Memory | Up to 128 GB | 128 GB, or a 64 GB SKU | 128 GB; 64 GB through partners |
| Bandwidth | 300 GB/s (NVIDIA figure) | 273 GB/s | 273 GB/s |
| Operating system | Windows 11 on Arm | DGX OS | DGX OS |
| Linking units | NVIDIA PAIR over the LAN | Two units over ConnectX-7 | Two units over ConnectX-7 |
| Size | About one liter | 150 x 150 x 50.5 mm, 1.2 kg | 150 x 150 x 50.5 mm, 1.2 kg |
| Price | Not announced | From $3,499.99 at launch | $3,999 at launch, $4,699 from February 2026 |

ATOM figures come from [CNX Software](https://www.cnx-software.com/2025/10/23/gigabyte-ai-top-atom-an-nvidia-gb10-desktop-ai-supercomputer-with-1-petaflop-ai-10gbe-128gb-ram/) and the DGX Spark increase from an [NVIDIA forum post](https://forums.developer.nvidia.com/t/2-23-2026-price-change-announcement/361713); Implicator reported $6,950 in October 2026, unconfirmed by NVIDIA. NVIDIA PAIR spreads inference across local devices, but whether it pools memory like linked GB10 units is unconfirmed, as [Basic Tutorials](https://basic-tutorials.com/news/gigabyte-ai-top-aero-rtx-spark-mini-pc-with-128-gb-for-local-ai-on-windows-11/) notes.

## What the Gigabyte AI TOP AERO can run on 128 GB

Unified memory lets the GPU address most of the pool, but on Windows not all 128 GB. StorageReview found up to 96 GB can be allocated to the GPU on the Surface Laptop Ultra, which uses the same N1X chip, and a user on the [NVIDIA developer forum](https://forums.developer.nvidia.com/t/rtx-spark-on-windows-cuda-allocations-consume-system-commit-even-with-96-gib-dedicated-gpu-memory/386453) reported a 60.25 GiB Windows commit limit despite 95.99 GiB of dedicated GPU memory. That issue is open.

At 4-bit quantization, weights take about half a byte per parameter, so a 120B-parameter model needs roughly 60 GB before the context cache. Microsoft says its 128 GB RTX Spark Dev Box runs 120B-parameter models with a 1-million-token context, according to [Starry Hope](https://www.starryhope.com/minipcs/surface-rtx-spark-mac-studio-not-mac-mini/). GIGABYTE has not stated a maximum model size.

For speed, StorageReview measured these rates on the N1X Surface Laptop Ultra, without stating the quantization:

| Model | Tokens per second |
| --- | --- |
| Phi-4-mini | 97.5 |
| Qwen3.6-35B-A3B | 89.2 |
| gpt-oss:20b | 58 to 59 |
| Llama 3.1 8B (MLPerf Client) | 56.4 |

Models from 8B to 35B parameters, and mixture-of-experts models with few active parameters, are the comfortable zone. For a 120B-class reference, StorageReview's [AI TOP ATOM review](https://www.storagereview.com/review/gigabyte-ai-top-atom-review) measured GPT-OSS-120B at 47.01 tokens per second at batch size 1 on GB10 with vLLM under Linux. Treat that as a comparison point, not a forecast for the AERO.

### Why bandwidth sets the speed limit

Each generated token requires reading the active weights, so bandwidth caps decode speed more than compute does. NVIDIA's 300 GB/s is well below the 614 GB/s of a Mac Studio with M5 Max and the 1.2 TB/s of the M5 Ultra, per [MacRumors](https://www.macrumors.com/guide/m5-max-vs-m5-ultra/). StorageReview measured 122 GB/s in STREAM Triad on the Surface, and on models that fit in 24 GB of VRAM, a Razer Blade 16 with an RTX 5090 Laptop GPU reached 2.3 times the Surface's token rate.

[Club386](https://www.club386.com/gigabyte-nvidia-rtx-spark-mini-pc/) argues that NVIDIA should lead on prompt processing while the Mac Studio is likely faster at token generation. That is reasoning, not a measurement, but it fits the numbers: long inputs favor the AERO's compute, long outputs favor bandwidth. Our guide to [running AI locally](/blog/can-i-run-ai-locally-guide/) explains how memory size and bandwidth trade off by model size.

## Software: Windows on Arm, CUDA and the named tools

For the Gigabyte AI TOP AERO, GIGABYTE names CUDA, NVIDIA Nemotron models, LM Studio, Ollama, ComfyUI, NVIDIA PAIR, Broadcast and RTX Video, according to [Notebookcheck](https://www.notebookcheck.net/Gigabyte-takes-on-Mac-Studio-with-a-tiny-AI-PC-powered-by-Nvidia-RTX-Spark.1447215.0.html). AI TOP Utility, GIGABYTE's management software for the ATOM, is not mentioned in any AERO source we found.

The risk is everything outside that list. x64 Windows apps run through Microsoft's Prism emulation. StorageReview found native SVT-AV1 encoding ran at about one fifth of the speed of x64 systems, and the official Windows on Arm build of OpenBLAS capped at 12 threads. Check for Arm64 builds of every plugin, driver and internal tool you depend on. Our [MacBook Pro M4 vs Snapdragon X Elite comparison](/blog/macbook-pro-m4-vs-snapdragon-x-elite-laptops-docking-thermals-battery/) covers the same Windows on Arm questions from the laptop side.

Linux is open. NVIDIA does not document a Linux or DGX OS option for RTX Spark in the pages we reviewed, and forum users asking have had no answer. Microsoft's Dev Box ships WSL2 with GPU passthrough; GIGABYTE has not said whether the Gigabyte AI TOP AERO does.

## Gaming on the Gigabyte AI TOP AERO: possible, not the point

[Notebookcheck's RTX Spark analysis](https://www.notebookcheck.net/Nvidia-RTX-Spark-Analysis-Finally-an-answer-to-Apple-s-M5-Pro-M5-Max.1422820.0.html) found the N1X GPU about 50% faster than AMD's Radeon 8060S and comparable to powerful RTX 5070 versions. GIGABYTE advertises DLSS 5 in supported games. Compatibility is the catch: F1 25 and Battlefield 6 did not run in Notebookcheck's testing, Assassin's Creed titles stuttered, and Basic Tutorials cites ComputerBase saying Call of Duty is not expected before 2027. Count any game that runs well as a bonus.

## Gigabyte AI TOP AERO vs other DGX Spark alternatives

The AERO is not the only RTX Spark mini PC, and RTX Spark is not the only route to 128 GB of unified memory.

| Machine | Chip and memory | Operating system | Price status |
| --- | --- | --- | --- |
| Gigabyte AI TOP AERO | RTX Spark N1X, up to 128 GB | Windows 11 on Arm | Not announced |
| Surface RTX Spark Dev Box | RTX Spark, 128 GB | Windows 11 Pro dev image with WSL2 | $5,999.99, US only |
| ASUS ProArt GR1X | RTX Spark N1X, 64 or 128 GB | Windows on Arm | No official price |
| MSI EdgeMesa N AI+ | RTX Spark N1X, up to 128 GB | Windows 11 Pro | Not confirmed |
| Mac Studio (M5 Max) | Up to 128 GB, 614 GB/s | macOS | From $2,499 with 36 GB; 128 GB price not published |
| Mac Studio (M5 Ultra) | 96 to 512 GB, 1.2 TB/s | macOS | From $5,499 |
| Ryzen AI Max+ 395 mini PCs | Up to 128 GB, about 256 GB/s | Windows 11 (x86) | About $3,450 to $4,349 at 128 GB |

Details come from the [ASUS press release](https://press.asus.com/news/press-releases/asus-proart-p16-p14-gr1x-rtx-spark-ifa-2026/), the [MSI datasheet](https://storage-asset.msi.com/datasheet/edge-ai/us/EdgeMesa-N-AI-plus.pdf), and Implicator and Starry Hope for Strix Halo prices; AMD's Ryzen AI Halo box was announced at $3,999, per [Tom's Hardware](https://www.tomshardware.com/desktops/mini-pcs/amd-challenges-nvidias-dgx-spark-with-usd3-999-ryzen-ai-halo-with-windows-11-support-strix-halo-desktop-undercuts-nvidia-by-usd700-packs-128gb-of-unified-memory).

Choose the ATOM or DGX Spark for Linux, DGX software parity or two-unit clustering. Choose a Mac Studio if token generation matters most or you need more than 128 GB; Notebookcheck measured the M5 Max GPU 27% faster than N1X. Choose Strix Halo for x86 Windows compatibility at a lower price, accepting a GPU that Notebookcheck's numbers put about a third behind N1X. The AERO's case is CUDA on Windows in a small box.

## Setting up the Gigabyte AI TOP AERO on a desk

GIGABYTE says about one liter. The ATOM measures 150 x 150 x 50.5 mm, but GIGABYTE has not published the AERO's dimensions, so do not plan a shelf around the ATOM's numbers.

Power is the bigger unknown. NVIDIA lists 140 W TDP for the desktop N1X, and GIGABYTE does not state the AERO's power supply. Comparable machines use external adapters: 240 W USB-C on the ATOM and 240 W on MSI's RTX Spark box. Plan for a brick on or under the desk, and route it with our guide to [cable management for a small desk](/blog/cable-management-for-a-small-desk/).

Noise is untested; StorageReview's ATOM review recorded burst temperatures of 90 °C on the CPU and 81 °C on the GPU but no noise figure. If the box will sit at arm's length during calls, wait for a review that measures fans under sustained inference.

GIGABYTE has not published a supported display count. ASUS says its GR1X drives four 4K displays, which shows the platform's reach, not the AERO's. If you are pairing it with a sharp screen, our [27-inch 4K OLED buying guide](/blog/27-inch-4k-oled-for-work-2026-buying-guide/) covers the monitor side.

## Who should buy the Gigabyte AI TOP AERO

Buy it if you are a Windows-first developer prototyping local LLM agents and want CUDA without a tower, a creator whose ComfyUI pipelines outgrow a 24 GB card, or a small team that wants one box serving models over 10GbE. All of that depends on a price closer to Strix Halo machines than to the Surface Dev Box.

Wait if you need the price, the port list or a noise figure first. Skip it if you need Linux, clustering, the fastest token generation or a gaming PC.

## Gigabyte AI TOP AERO price and availability

GIGABYTE tells buyers to "refer to local GIGABYTE announcements for regional product configurations, pricing and availability," according to the [Technode Global copy of the release](https://technode.global/?p=997298). For context, 64 GB GB10 systems start at $4,999 through partners including GIGABYTE, per the [NVIDIA blog](https://blogs.nvidia.com/?p=98570).

## Frequently asked questions

### What is the Gigabyte AI TOP AERO?

A roughly 1-liter Windows 11 mini PC that GIGABYTE launched on November 10, 2026. It uses NVIDIA's RTX Spark N1X superchip, with a 20-core Grace CPU and a 6,144-core Blackwell GPU, plus up to 128 GB of unified memory, up to 4 TB of PCIe Gen5 storage, 10GbE and Wi-Fi 7, according to GIGABYTE's press release.

### How much does the Gigabyte AI TOP AERO cost?

GIGABYTE has not announced a price. It says regional configurations, pricing and availability will come from local GIGABYTE announcements. For context, Microsoft's 128 GB Surface RTX Spark Dev Box lists at $5,999.99, according to Starry Hope.

### What is the difference between RTX Spark and DGX Spark?

DGX Spark uses NVIDIA's GB10 chip with DGX OS (Linux), 273 GB/s of memory bandwidth and ConnectX-7 networking for linking two units. RTX Spark runs Windows 11 on Arm, NVIDIA's porting guide lists 300 GB/s, and the AERO lists 10GbE without ConnectX-7. Both pair a 20-core Grace CPU with a 6,144-core Blackwell GPU and up to 128 GB of memory.

### Is RTX Spark good for gaming?

Partly. Notebookcheck found the N1X GPU comparable to powerful RTX 5070 versions, and DLSS 5 works in supported games. But it runs Windows on Arm, many games rely on emulation, and F1 25 and Battlefield 6 did not run in Notebookcheck's tests. Treat gaming as a bonus.

### Is RTX Spark Arm or x86, and can it run Linux?

It is Arm: the CPU uses Cortex-X925 and Cortex-A725 cores on Armv9.2, and x64 Windows apps run through Microsoft's Prism emulation. The AERO ships with Windows 11. NVIDIA has not documented a Linux or DGX OS option for RTX Spark in the sources for this guide, although Microsoft's RTX Spark Dev Box offers WSL2 with GPU passthrough.

## Bottom line

The Gigabyte AI TOP AERO puts NVIDIA's Windows superchip and 128 GB of unified memory in about one liter, but it is still an announcement without a price or review. Platform evidence points to strong prompt processing, middling token generation and real Windows on Arm gaps. Shortlist it if you want CUDA on Windows in a small box; look elsewhere if you need Linux, clustering or maximum decode speed.

## Sources

- [GIGABYTE press release via TechPowerUp](https://www.techpowerup.com/354649/gigabyte-launches-the-ai-top-aero-powered-by-nvidia-rtx-spark)
- [GIGABYTE press release via Technode Global](https://technode.global/?p=997298)
- [Wccftech: AI TOP AERO launch](https://wccftech.com/gigabyte-debuts-ai-top-aero-with-nvidia-rtx-spark)
- [Notebookcheck: AI TOP AERO](https://www.notebookcheck.net/Gigabyte-takes-on-Mac-Studio-with-a-tiny-AI-PC-powered-by-Nvidia-RTX-Spark.1447215.0.html)
- [Club386: GIGABYTE RTX Spark mini PC](https://www.club386.com/gigabyte-nvidia-rtx-spark-mini-pc/)
- [Basic Tutorials: AI TOP AERO](https://basic-tutorials.com/news/gigabyte-ai-top-aero-rtx-spark-mini-pc-with-128-gb-for-local-ai-on-windows-11/)
- [NVIDIA newsroom: RTX Spark](https://nvidianews.nvidia.com/news/nvidia-microsoft-windows-pcs-agents-rtx-spark)
- [NVIDIA RTX Spark specifications](https://www.nvidia.com/en-us/products/rtx-spark/specifications/)
- [NVIDIA RTX Spark porting guide](https://docs.nvidia.com/rtx-spark/rtx-spark-porting-guide/latest/overview.html)
- [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)
- [NVIDIA blog: 64 GB DGX Spark](https://blogs.nvidia.com/?p=98570)
- [NVIDIA forum: DGX Spark price change](https://forums.developer.nvidia.com/t/2-23-2026-price-change-announcement/361713)
- [NVIDIA forum: RTX Spark commit limit](https://forums.developer.nvidia.com/t/rtx-spark-on-windows-cuda-allocations-consume-system-commit-even-with-96-gib-dedicated-gpu-memory/386453)
- [StorageReview: Surface Laptop Ultra (N1X)](https://www.storagereview.com/review/microsoft-surface-laptop-ultra-for-business-review-rtx-spark-n1x)
- [StorageReview: AI TOP ATOM](https://www.storagereview.com/review/gigabyte-ai-top-atom-review)
- [CNX Software: AI TOP ATOM](https://www.cnx-software.com/2025/10/23/gigabyte-ai-top-atom-an-nvidia-gb10-desktop-ai-supercomputer-with-1-petaflop-ai-10gbe-128gb-ram/)
- [Notebookcheck: RTX Spark analysis](https://www.notebookcheck.net/Nvidia-RTX-Spark-Analysis-Finally-an-answer-to-Apple-s-M5-Pro-M5-Max.1422820.0.html)
- [Starry Hope: Surface RTX Spark Dev Box](https://www.starryhope.com/minipcs/surface-rtx-spark-mac-studio-not-mac-mini/)
- [Implicator: DGX Spark pricing](https://www.implicator.ai/nvidia-adds-64gb-dgx-spark-at-4-999-as-128gb-model-climbs-to-6-950/)
- [ASUS ProArt GR1X](https://press.asus.com/news/press-releases/asus-proart-p16-p14-gr1x-rtx-spark-ifa-2026/)
- [MSI EdgeMesa N AI+ datasheet](https://storage-asset.msi.com/datasheet/edge-ai/us/EdgeMesa-N-AI-plus.pdf)
- [MacRumors: Mac Studio M5 Max vs M5 Ultra](https://www.macrumors.com/guide/m5-max-vs-m5-ultra/)
- [Tom's Hardware: AMD Ryzen AI Halo](https://www.tomshardware.com/desktops/mini-pcs/amd-challenges-nvidias-dgx-spark-with-usd3-999-ryzen-ai-halo-with-windows-11-support-strix-halo-desktop-undercuts-nvidia-by-usd700-packs-128gb-of-unified-memory)

*Cover image: edited by Light Scripts from a GIGABYTE AI TOP AERO product photo. Source: [GIGABYTE](https://wccftech.com/gigabyte-debuts-ai-top-aero-with-nvidia-rtx-spark) via Wccftech.*
