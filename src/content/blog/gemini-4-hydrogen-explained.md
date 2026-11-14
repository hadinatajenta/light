---
title: "Gemini 4 Hydrogen: Price, Benchmarks, and Who Should Switch"
description: "Gemini 4 Hydrogen costs $1.50/$7.50 per 1M tokens and edges Argon on the AA index. What changed, benchmarks, limits, pricing math, and who should switch."
seoTitle: "Gemini 4 Hydrogen: Price, Benchmarks, and Who Should Switch"
status: published
slug: gemini-4-hydrogen-explained
tags:
  - ai-software
  - google
  - gemini
  - agents
  - api
pubDate: 2026-11-14T14:00:00.000Z
noindex: false
affiliate: false
faq:
  - question: "Is Gemini 4 Hydrogen free?"
    answer: "Partly. The Gemini API free tier lists Gemini 4 Hydrogen as free of charge with rate limits, and Google may use that data to improve its products. Free Gemini app users get it through automatic model selection, and AI Mode in Search uses it for everyone. Paid API use costs $1.50 / $7.50 per 1M tokens."
  - question: "Is Gemini 4 Hydrogen better than Gemini 4 Argon?"
    answer: "On the Artificial Analysis Intelligence Index, Hydrogen scores 51 at its default high level and 54 at xhigh, versus 50 for Argon. Argon has a lower AA-Omniscience hallucination rate (4% versus 8%) and wins Chartography and Artificial Analysis's Terminal-Bench 4.0 run. Hydrogen is cheaper per token."
  - question: "Is Gemini 4 Hydrogen the same as Gemini 4 Flash?"
    answer: "Not by name. Google never calls it Flash, but its AI Studio documentation describes Gemini 4 Hydrogen as the recommended upgrade from Gemini 3.8 Flash, and pre-launch reports used Hydrogen as the codename for a Flash-tier Gemini 4 model."
  - question: "What is the Gemini 4 Hydrogen context window?"
    answer: "It is 1,048,576 tokens, shared by input, thinking, and output. A synchronous response is capped at 65,536 output tokens. Longer outputs, up to 1M tokens minus the input, require background execution."
  - question: "What is the xhigh thinking level?"
    answer: "It is a new fourth thinking level above low, medium, and the default high. Artificial Analysis measured 54 on its index at xhigh versus 51 at high, but 304M output tokens per index run versus 110M."
category: buying-basics
updatedDate: 2026-11-14T14:00:00.000Z
coverUrl: /media/96478ce9-ebf7-43fa-8a2d-a9be29ca6950.jpg
coverAlt: "Gemini 4 Hydrogen explainer cover with Google's translucent key art on a deep blue background"
focusKeyword: "gemini 4 hydrogen"
targetIntent: informational
---

Gemini 4 Hydrogen is the third Gemini 4 model Google has shipped in six weeks, and the one most developers will call most often. Announced on November 12, 2026, it is the fast tier that Google calls "our daily driver for agentic workflows." The surprise: on the Artificial Analysis Intelligence Index, Hydrogen edges Gemini 4 Argon, whose list price will be 2.67 times higher per token from December 1. That does not make it a drop-in Argon replacement. It states false facts more often, refuses more than its predecessor, and spends heavily on output tokens at its top setting.

## Quick answer

- Gemini 4 Hydrogen (model ID `gemini-4-hydrogen`) is Google's speed-focused Gemini 4 model and the recommended upgrade from Gemini 3.8 Flash.
- API pricing is $1.50 per 1M input tokens and $7.50 per 1M output tokens across the full 1M-token context, with a free API tier.
- Artificial Analysis scores it 51 at the default `high` thinking level and 54 at the new `xhigh` level, versus 50 for Argon and 59 to 60 for Carbon.
- It ships in the Gemini app, AI Mode in Search, AI Studio and the Gemini API, Android Studio, Google Antigravity, and Google Sheets.
- Caveats: an 8% AA-Omniscience hallucination rate (Argon and Carbon: 4%) and 5.57 points more unjustified refusals than 3.8 Flash, per Google's model card.
- Most 3.8 Flash and Argon API users should test it now, after running their own evals.

## What is Gemini 4 Hydrogen?

It is a generally available Google DeepMind model for fast, multi-step agent work. Google's [launch post](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/) describes it as "built for rapid execution across agentic workflows." It takes text, images, audio, video, and PDFs as input, returns text only, and has a March 2026 knowledge cutoff, per the [model card](https://deepmind.google/models/model-cards/gemini-4-hydrogen/).

### Where Hydrogen sits next to Argon and Carbon

Argon shipped to paying developers on October 13, 2026. Carbon became generally available on November 10 after early access through Google's Fairwind Program. Hydrogen followed two days later and skipped Fairwind, [according to SiliconANGLE](https://siliconangle.com/2026/11/12/google-releases-gemini-4-hydrogen-a-lower-cost-model-said-to-outscore-argon/). The model card says Hydrogen is "adapted from Gemini 4 Carbon," and Carbon's card says it is "based on Gemini 4 Argon." No parameter counts are disclosed.

The element names are the top complaint in the [Hacker News launch thread](https://news.ycombinator.com/item?id=50471431). In practice, Carbon is the strongest, Argon the general frontier model, and Hydrogen the fast, cheaper one. Our [Gemini 4 Carbon vs Argon comparison](/blog/gemini-4-carbon-vs-argon-benchmarks-cybersecurity/) covers the two larger models.

### Is Gemini 4 Hydrogen the same as Gemini 4 Flash?

In function, yes. Google's [AI Studio documentation](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen) calls it the "recommended upgrade from Gemini 3.8 Flash and earlier Gemini 3 and 2.5 models," and [kie.ai](https://kie.ai/blog/what-is-gemini-4-hydrogen) reported "Hydrogen" as the codename for a Flash-tier model before launch. Google simply never uses the Flash name.

## What's new in Gemini 4 Hydrogen

### Four thinking levels, including xhigh

The `thinking_level` parameter accepts `low`, `medium`, `high` (the default), and a new `xhigh`. Carbon and Argon default to `medium` and cap at `high`. The old `minimal` level now returns an error. [Artificial Analysis](https://artificialanalysis.ai/models/gemini-4-hydrogen) measured each level:

| Thinking level | AA Index v5.0.1 | First answer token | Time per index task | Output tokens per index run |
| --- | --- | --- | --- | --- |
| `xhigh` | 54 | 43.34 s | 14.8 min | 304M |
| `high` (default) | 51 | 17.60 s | 8.4 min | 110M |
| `medium` | 41 | 11.69 s | 3.8 min | 54.4M |
| `low` | 27 | 5.65 s | 1.4 min | 20.3M |

Moving from `high` to `xhigh` adds 3 points but nearly triples output tokens; `medium` matches the class median of 41. Output speed is 168 to 174 tokens per second on the AA page as of November 14; [OrcaRouter](https://www.orcarouter.ai/blog/gemini-4-hydrogen-vs-gemini-4-argon) reported 179 and 190, likely a different snapshot.

![Gemini 4 Hydrogen Artificial Analysis Index score versus time per task across its four thinking levels](/media/3e858ae3-77ff-4b46-8239-c388de71227a.jpg)

*Image source: [Google](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/), data from Artificial Analysis.*

The scores in Google's chart match the Artificial Analysis page, but the times do not: the chart plots roughly 6 minutes per task at `high` and 13 minutes at `xhigh`, shorter than the 8.4 and 14.8 minutes the AA page lists today. Use the table for planning and the chart for the shape of the curve.

### 1M context, but a 65K synchronous output cap

The 1,048,576-token context covers input, thinking, and output. Google's blog mentions "up to 1 million output tokens," but a normal synchronous call is capped at 65,536 output tokens ("64K by default" in the model card). Longer outputs need `background: true`, which raises the ceiling to 1M minus your input. Argon and Carbon cap synchronous REST output at 32,768.

### Google's agentic and safety claims

Against 3.8 Flash, Google claims 2.5x faster task completion, up to 81% less overreach, 12x fewer misaligned actions or shortcuts, and up to 2x lower likelihood of bypassing permission boundaries. [Digital Trends](https://www.digitaltrends.com/cool-tech/googles-next-gen-gemini-4-hydrogen-ai-model-is-here-touting-faster-intelligence-for-all/) and OrcaRouter also cite "more than 5x fewer fabricated claims," attributed to Google, but Google's [developer blog](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-4-hydrogen/) says only "fewer fabricated claims." In Search, Google calls Hydrogen ["the biggest model upgrade to Search yet,"](https://blog.google/products-and-platforms/products/search/gemini-4-hydrogen-search-upgrade) now live in AI Mode for all users.

## Gemini 4 Hydrogen benchmarks

### Google's numbers vs Claude Sonnet 5.5 and GPT-6.1 Terra

![Gemini 4 Hydrogen benchmark table versus Claude Sonnet 5.5 and GPT-6.1 Terra, published by Google](/media/54da74f1-ffb8-416b-96bd-5c0e40308bb6.jpg)

*Image source: [Google](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/).*

| Benchmark | Gemini 4 Hydrogen | Claude Sonnet 5.5 | GPT-6.1 Terra |
| --- | --- | --- | --- |
| SWE-sweep | **13.5%** | 3.1% | 5.8% |
| Terminal-Bench 4.1 (cheating-adjusted) | 57.0% | **63.9%** | — |
| Agents' Last Exam v1.1 | **71.6%** | 60.4% | 69.8% |
| AutomationBench-AA | **76.1%** | 71.8% | 60.2% |
| Vending-Bench 2 | **$14,549** | $11,165 | $9,107 |
| OSWorld-2.1 (offline) | 77.6% | **83.9%** | 74.2% |
| MKA | **53.4%** | 52.0% | 43.8% |
| Chartography | **66.6%** | 61.6% | 63.2% |
| Terminal-Bench-Science 0.1 | 51.4% | **59.9%** | 58.3% |
| HLE-Diamond | **58.8%** | 53.3% | 47.3% |

Hydrogen leads 7 of 10 rows; Sonnet 5.5 wins the three terminal and computer-use tasks. The [methodology](https://deepmind.google/models/evals-methodology/gemini-4-hydrogen) is public, but every number is self-reported.

### What independent testers found

DataCamp, [citing Artificial Analysis](https://www.datacamp.com/blog/gemini-4-hydrogen), reports Claude Sonnet 5.5 and GPT-6.1 Sol at 55 on their maximum settings; we could not see those scores on the leaderboard directly, so treat them as secondhand.

The weak spot is [AA-Omniscience](https://artificialanalysis.ai/evaluations/omniscience): Hydrogen's hallucination rate is 8% at `xhigh` on the AA page, versus 4% for Argon and Carbon. OrcaRouter cites 8.5% at `xhigh` and 8.7% at `high`. Either way, it is about double.

A small [Puter test](https://developer.puter.com/blog/gemini-4-hydrogen-review/) is kinder: across 48 answers to prompts with missing information, Hydrogen flagged every gap and stated one false fact, versus 40 flags and six false facts for 3.8 Flash. The author wrote the prompts and the grading, so treat it as indicative. Noticing missing context and recalling facts are different skills.

### The Terminal-Bench version problem

Two Terminal-Bench versions are in circulation. Google's 57.0% is on 4.1, cheating-adjusted. Artificial Analysis runs 4.0 in its own harness, where Hydrogen scores 53.5% per OrcaRouter or 54% per DataCamp, against 57.1% for Argon. Google is inconsistent too: its launch blog cites 4.0 for an Antigravity claim that the [Antigravity blog](https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity) attributes to 4.1.

## Gemini 4 Hydrogen vs Carbon vs Argon

| | Gemini 4 Hydrogen | Gemini 4 Argon | Gemini 4 Carbon |
| --- | --- | --- | --- |
| Input / output per 1M | $1.50 / $7.50 | $2 / $10, then $4 / $20 | Same as Argon |
| Synchronous output cap | 65,536 | 32,768 | 32,768 |
| Default thinking level | high (max xhigh) | medium (max high) | medium (max high) |
| AA Intelligence Index | 51 (high), 54 (xhigh) | 50 | 59 (card) / 60 (AA page) |
| AA-Omniscience hallucination | 8% | 4% | 4% |
| Terminal-Bench 4.0 (AA) | 53.5% | 57.1% | 65.2% |
| Agents' Last Exam v1.1 | 71.6% | 69.0% | 77.4% |
| OSWorld-2.1 (offline) | 77.6% | 74.7% | 81.5% |
| Chartography | 66.6% | 71.6% | 72.5% |

Carbon's model card lists 59 on AA Index v5.0; the current AA page shows 60.

Our reading: Hydrogen sits closer to Argon than its price suggests. It beats Argon on Agents' Last Exam and OSWorld-2.1, while Argon keeps Chartography, AA's Terminal-Bench, and a lower hallucination rate. Carbon leads both on every benchmark row and ties Argon on hallucination rate. Our [Gemini 4 Argon deep dive](/blog/gemini-4-argon-google-frontier-model-reasoning-coding-cybersecurity/) covers Argon's reasoning modes.

## Gemini 4 Hydrogen pricing

### Rate card

The [pricing page](https://aistudio.google.com/docs/pricing) lists Standard at $1.50 / $7.50, with thinking billed as output and no long-context surcharge. Caching is implicit only, at $0.075 per 1M cached tokens for prompts of 4,096 tokens or more. Batch costs $0.75 / $3.75 and Priority $2.70 / $13.50. The free tier has rate limits, and Google uses free-tier data to improve its products.

Argon and Carbon move from $2 / $10 to $4 / $20: Carbon's blog says "from November 30," the pricing page says December 1, so we treat the intro rate as ending November 30. Gemini 3.8 Flash moves from $0.75 / $3.75 to $1.50 / $7.50 on January 1, 2027.

### Pricing math for one workload

An agent processing 10M input and 2M output tokens a day on Standard, from Google's rate card:

| Model and pricing | Per day | Per 30 days |
| --- | --- | --- |
| Hydrogen, no caching | $30.00 | $900 |
| Hydrogen, 70% cache hits on input | $20.03 | about $601 |
| Hydrogen, Batch | $15.00 | $450 |
| Argon or Carbon, from December 1 | $80.00 | $2,400 |
| Gemini 3.8 Flash, through December 31 | $15.00 | $450 |

Cache hits are not guaranteed. Hydrogen costs twice as much as 3.8 Flash until January 1, then the same.

### The hidden cost: thinking tokens

DataCamp, citing Artificial Analysis, puts cost per index task at about $0.80 on `medium`, $1.87 on `high`, and $3.16 on `xhigh`. In Puter's test, Hydrogen's median answer used 400 output tokens versus 116 for 3.8 Flash, making it about 5x more expensive at current prices.

## Who should switch, and who should not

Switch if you run 3.8 Flash for agentic work. From January 1 the list price is identical, and Google reports 57% on Terminal-Bench 4.1 versus Flash's 18.2%. Argon users doing everyday coding and knowledge work should test it too, since Argon will cost 2.67x more per token from December 1.

Stay on Sonnet 5.5 or Carbon for terminal-heavy agents, and on Argon for recall-heavy apps. For pure routing or classification, the [Gemini Decisions API](/blog/gemini-decisions-api-guide/) may be cheaper than any generative model, and our [DeepSeek V4.1 Flash breakdown](/blog/deepseek-v4-1-flash-architecture-benchmarks-kv-cache-pricing/) covers a fast-tier alternative outside Google.

## How to try Gemini 4 Hydrogen

The fastest route is Google AI Studio with the model ID `gemini-4-hydrogen` on the free tier:

```py
from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-4-hydrogen",
    contents="List the failing checks in this CI log and rank them by risk.",
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level="medium"),
    ),
)
print(response.text)
```

When migrating, remove `temperature`, `top_p`, and `top_k` (they can return a 400 error), drop `cached_content`, and replace `minimal` thinking. In Google Antigravity, on paid AI Pro and Ultra plans, a new Orchestrator mode lets Carbon plan while Hydrogen edits code and runs tests.

## Limitations and open questions

The model card warns that Gemini 4 Hydrogen may hallucinate and occasionally times out. Unjustified refusals rose 5.57 points versus 3.8 Flash, mostly on multimodal prompts. Under Google's Frontier Safety Framework, it does not reach the CBRN or cyber Critical Capability Levels but does reach the alert thresholds for both, and the full safety report is "coming soon."

Rate limits are unpublished, Vertex AI is not named on the launch page, and a "minimum 45-day retirement notice" reported by DataCamp does not appear in Google's primary pages.

## Frequently asked questions

### Is Gemini 4 Hydrogen free?

Partly. The Gemini API free tier lists Gemini 4 Hydrogen as free of charge with rate limits, and Google may use that data to improve its products. Free Gemini app users get it through automatic model selection, and AI Mode in Search uses it for everyone. Paid API use costs $1.50 / $7.50 per 1M tokens.

### Is Gemini 4 Hydrogen better than Gemini 4 Argon?

On the Artificial Analysis Intelligence Index, Hydrogen scores 51 at its default high level and 54 at xhigh, versus 50 for Argon. Argon has a lower AA-Omniscience hallucination rate (4% versus 8%) and wins Chartography and Artificial Analysis's Terminal-Bench 4.0 run. Hydrogen is cheaper per token.

### Is Gemini 4 Hydrogen the same as Gemini 4 Flash?

Not by name. Google never calls it Flash, but its AI Studio documentation describes Gemini 4 Hydrogen as the recommended upgrade from Gemini 3.8 Flash, and pre-launch reports used Hydrogen as the codename for a Flash-tier Gemini 4 model.

### What is the Gemini 4 Hydrogen context window?

It is 1,048,576 tokens, shared by input, thinking, and output. A synchronous response is capped at 65,536 output tokens. Longer outputs, up to 1M tokens minus the input, require background execution.

### What is the xhigh thinking level?

It is a new fourth thinking level above low, medium, and the default high. Artificial Analysis measured 54 on its index at xhigh versus 51 at high, but 304M output tokens per index run versus 110M.

## Sources

- [Introducing Gemini 4 Hydrogen, Google, November 12, 2026](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/)
- [Hydrogen model card, Google DeepMind, November 2026](https://deepmind.google/models/model-cards/gemini-4-hydrogen/)
- [What's new in Gemini 4 Hydrogen, Google AI Studio, November 2026](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen)
- [Gemini API pricing, Google AI Studio, November 2026](https://aistudio.google.com/docs/pricing)
- [Build with Gemini 4 Hydrogen, Google, November 12, 2026](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-4-hydrogen/)
- [Hydrogen in Google Antigravity, Google, November 12, 2026](https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity)
- [Search upgrade with Hydrogen, Google, November 12, 2026](https://blog.google/products-and-platforms/products/search/gemini-4-hydrogen-search-upgrade)
- [Gemini 4 Carbon now available, Google, November 10, 2026](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/)
- [Hydrogen model page, Artificial Analysis, November 2026](https://artificialanalysis.ai/models/gemini-4-hydrogen)
- [AA-Omniscience, Artificial Analysis, November 2026](https://artificialanalysis.ai/evaluations/omniscience)
- [Hydrogen launch report, SiliconANGLE, November 12, 2026](https://siliconangle.com/2026/11/12/google-releases-gemini-4-hydrogen-a-lower-cost-model-said-to-outscore-argon/)
- [Google's next-gen Hydrogen model, Digital Trends, November 12, 2026](https://www.digitaltrends.com/cool-tech/googles-next-gen-gemini-4-hydrogen-ai-model-is-here-touting-faster-intelligence-for-all/)
- [Hydrogen review, Puter, November 13, 2026](https://developer.puter.com/blog/gemini-4-hydrogen-review/)
- [Gemini 4 Hydrogen Explained, DataCamp, November 13, 2026](https://www.datacamp.com/blog/gemini-4-hydrogen)
- [Hydrogen vs Argon, OrcaRouter, November 13, 2026](https://www.orcarouter.ai/blog/gemini-4-hydrogen-vs-gemini-4-argon)
- [What Is Gemini 4 Hydrogen?, kie.ai, November 8, 2026](https://kie.ai/blog/what-is-gemini-4-hydrogen)
- [Launch discussion, Hacker News, November 12, 2026](https://news.ycombinator.com/item?id=50471431)

*Cover image: edited by Light Scripts from Google's Gemini 4 Hydrogen key art. Source: [Google](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/).*
