---
title: "Gemini 4 Carbon vs Argon: What Actually Changed"
description: "Gemini 4 Carbon vs Argon compared: benchmark gains, cybersecurity, coding, safety, pricing, and why Carbon is still limited to cyber defenders."
status: published
slug: gemini-4-carbon-vs-argon-benchmarks-cybersecurity
tags:
  - gemini
  - gemini-carbon
  - gemini-argon
  - ai-models
  - google
  - cybersecurity
  - coding
  - benchmarks
  - developer-tools
pubDate: 2026-11-06T05:25:37.000Z
noindex: false
affiliate: false
faq:
  - question: What is Gemini 4 Carbon?
    answer: "Gemini 4 Carbon is Google DeepMind's frontier model announced on 28 October 2026, two weeks after Gemini 4 Argon. It is built for long-horizon engineering and defensive cybersecurity, and Google says it is its strongest model, ranking first on the Artificial Analysis Intelligence Index v5.0 at 59."
  - question: How is Carbon different from Argon?
    answer: "Carbon is a cybersecurity-first specialist built on Argon. It improves on Argon across most of Google's published benchmarks, especially agentic coding, long-context retrieval, science, and vulnerability discovery, exploitation, and patching. Argon is the general-purpose model that is broadly available today; Carbon is limited to vetted cyber defenders through the Fairwind Program."
  - question: Is Carbon better than Argon?
    answer: "On Google's published benchmark table, Carbon beats Argon on every row, including a 59 to 50 lead on the Artificial Analysis Intelligence Index and a 71.0% to 68.0% lead on CWE-bench. The gains are workload-specific, and Carbon does not win every comparison against rivals: GPT-6 Astra leads FrontierSWE 2, and Claude Opus 5.5 leads OSWorld-2.1."
  - question: Can I use Carbon today?
    answer: "Not generally. Carbon is being released first to a subset of cyber defenders and then to additional trusted partners through Google's Fairwind Program. Google has not announced a general availability date for developers, businesses, or consumers. Argon is available now through the Gemini API, AI Studio, the Gemini platform, and eligible consumer and enterprise surfaces."
  - question: How much does Carbon cost?
    answer: "Carbon has the same introductory price as Argon: $2 per million input tokens and $10 per million output tokens, with cached input tokens at a 95% discount. After the introductory period, the listed price is $4 per million input and $20 per million output tokens. Google has not specified when Carbon's introductory period ends; Argon's introductory price ends on 30 November 2026."
  - question: Is Carbon safer than Argon?
    answer: "Google reports better safety metrics for Carbon, including 0.0% indirect prompt-injection attack success versus 0.7% for Argon, 0.0% successful cheating on Terminal-Bench 4.0, roughly half as many unsupported claims, and an almost 80% drop in high-severity misalignment alerts in internal live coding. These are vendor-run evaluations; independent testing and broader deployment will matter more than the launch numbers."
  - question: Does Carbon have a 1M context window?
    answer: "Google has not published a separate context limit for Carbon. It is built on Argon, whose Gemini API budget is a 1M unified input-output token limit, and Carbon's GraphWalks result covers 256k to 1M tokens. Treat 1M as the tested long-context range, not a separate Carbon specification."
category: buying-basics
updatedDate: 2026-11-06T05:25:37.000Z
coverUrl: /media/733ca7dd-f08b-4f64-938c-fa14b795a18d.png
coverAlt: "Gemini 4 Carbon vs Argon comparison cover with benchmark bars, cybersecurity metrics, and access labels"
focusKeyword: Gemini 4 Carbon vs Argon
targetIntent: informational
---

Gemini 4 Carbon vs Argon is not a simple upgrade story. Carbon is Google's strongest model on the Artificial Analysis Intelligence Index, but it is also a deliberately restricted cybersecurity specialist that most developers cannot use yet. Argon is the model they can use today. The comparison is therefore two questions at once: what did Google actually improve, and what can you actually deploy?

The short version is that Carbon is a real step forward on the workloads Google cares about most: long-horizon coding, agentic tool use, long-context retrieval, science and math, and defensive cybersecurity. It beats Argon on almost every row of Google's published benchmark table. But the gains are uneven, Carbon does not win every comparison against GPT-6 Astra or Claude Opus 5.5, and its access model is part of the product. Argon remains the practical choice for most teams.

## Quick answer

- Gemini 4 Carbon was announced on 28 October 2026, two weeks after Gemini 4 Argon. Google calls it its strongest model, with state-of-the-art cybersecurity and long-horizon capabilities.
- Carbon ranks first on the Artificial Analysis Intelligence Index v5.0 at 59, versus 50 for Argon, 58 for Claude Opus 5.5, and 57 for GPT-6 Astra.
- Carbon beats Argon on all 17 rows in Google's published comparison table. The biggest gains are in exploitation (+12.8 points on ExploitGym), long-context retrieval (+12.0 on GraphWalks), science (+11.9 on Terminal-Bench-Science), and agentic coding (+8.4 on Agents' Last Exam).
- The gains are not universal. GPT-6 Astra leads Carbon on FrontierSWE 2 (65.5% vs 61.2%), and Claude Opus 5.5 leads on OSWorld-2.1 (87.2% vs 81.5%). The composite index hides those trade-offs.
- Carbon's cybersecurity results are the headline: 88.2% on SEC-bench Pro for finding vulnerabilities, 54.8% on ExploitGym for exploitation, and 71.0% on CWE-bench for patching.
- Carbon's safety numbers improve on Argon in Google's internal tests: 0.0% indirect prompt-injection success, 0.0% successful cheating on Terminal-Bench 4.0, roughly half as many unsupported claims, and an almost 80% drop in high-severity misalignment alerts.
- Carbon and Argon share the same introductory price: $2 per million input tokens and $10 per million output tokens, with cached input at a 95% discount. The later list price is $4/$20.
- The biggest practical difference is access. Argon is generally available now. Carbon is limited to vetted cyber defenders through the Fairwind Program, with no general availability date.

## What is Gemini 4 Carbon?

Gemini 4 Carbon is the model Google announced on 28 October 2026 as the next step after Argon. The official description is precise: it is Google's strongest model with state-of-the-art cybersecurity and long-horizon capabilities. It is not positioned as a cheaper, faster, or more general Argon replacement. It is positioned as a specialist frontier model for the hardest engineering and security work.

The headline benchmark is the Artificial Analysis Intelligence Index v5.0, where Carbon scored 59 and took first place at launch. That is one point ahead of Claude Opus 5.5, two points ahead of GPT-6 Astra, and nine points ahead of Argon. On the cybersecurity side, Google reports a firm lead on three benchmarks that map to the defense lifecycle: SEC-bench Pro at 88.2% for finding vulnerabilities, ExploitGym at 54.8% for validating exploitation, and CWE-bench at 71.0% for patching the root cause.

Carbon also improves on Argon in agentic coding and long-context work. Google says internal teams have seen it run for days through dead ends on complex, multi-step engineering tasks, root-causing and patching subtle bugs across large codebases and low-level systems. On WebDev Arena, Carbon reached 1,768 Elo, an 89-point improvement over Argon and fourth place at the time of the announcement.

The model is being released carefully. Google is participating in the US government's voluntary pre-release testing process and is making Carbon available first to a subset of cyber defenders, then to additional trusted partners through the Fairwind Program. Developers, businesses, and consumers will get access "as soon as possible," but Google has not announced a date. That is the single most important fact for anyone comparing Carbon and Argon today.

## What is Gemini 4 Argon?

Gemini 4 Argon is the general-purpose frontier model Google announced on 30 September 2026 and made globally available on 13 October 2026. It is built for complex software engineering, enterprise knowledge work such as legal and finance, scientific research, and defensive cybersecurity. It is the model behind Google's public API, AI Studio, the Gemini platform, Antigravity, the Gemini app, and AI Mode in Search for eligible subscribers.

Argon's defining specification is a 1M unified input-output token limit through the Gemini API, up from the previous 64K output ceiling. That budget lets an agent deliberate, plan, and generate a large artifact in one trajectory instead of stitching together many small calls. Argon also set a new state of the art on DeepSWE v1.1 at 77.9%, ranked first on the Vals Index, scored 51.3% on Zapier's AutomationBench, 91.7% on LVBench, and 68.0% on CWE-bench v1. Google's internal teams have used it for large-scale C/C++ to Rust migrations, Chrome refactors, Python performance work, quantum chemistry, and robotics.

The practical difference is maturity. Argon has been generally available for weeks, has a public API and pricing page, and has a growing body of user reports. Carbon has better headline numbers, but it is a limited-access preview aimed at defenders. If you need a model in production this month, Argon is the one you can actually call.

## Gemini 4 Carbon vs Argon: the benchmark table

Google published a comparison table with Carbon, Argon, GPT-6 Astra, Claude Opus 5.5, and Claude Fable 5.1. The table is the best single source for the comparison because it uses the same evaluation conditions across models. It is still vendor-run data, and the cybersecurity benchmarks were evaluated without guardrails, so treat the numbers as a starting point rather than a final verdict.

Here are the composite, coding, and agentic rows:

| Benchmark | Gemini 4 Carbon | Gemini 4 Argon | GPT-6 Astra | Claude Opus 5.5 |
| --- | --- | --- | --- | --- |
| Artificial Analysis Index v5.0 | 59 | 50 | 57 | 58 |
| Vals Index v2.2 | 70.4% | 69.2% | 65.0% | 70.2% |
| SWE-sweep | 9.6% | 4.3% | 9.5% | 3.6% |
| FrontierSWE 2 | 61.2% | 55.0% | 65.5% | 62.3% |
| Terminal-Bench 4.0 (AA) | 65.2% | 57.1% | 59.1% | 59.6% |
| Agents' Last Exam v1.1 | 77.4% | 69.0% | 73.1% | 71.6% |
| OSWorld-2.1 (offline subset) | 81.5% | 74.7% | 80.9% | 87.2% |
| AutomationBench (Zapier) | 53.9% | 51.3% | 41.4% | 42.5% |

And here are the knowledge-work, long-context, science, and cybersecurity rows:

| Benchmark | Gemini 4 Carbon | Gemini 4 Argon | GPT-6 Astra | Claude Opus 5.5 |
| --- | --- | --- | --- | --- |
| Vending-Bench 2 (bank balance) | $16,484 | $13,718 | $15,515 | $9,235 |
| Chartography | 72.5% | 71.6% | 71.0% | 66.3% |
| Blueprint-Bench 2 (similarity) | 58.6% | 54.4% | 49.7% | 51.2% |
| GraphWalks (256k–1M, BFS F1) | 96.2% | 84.2% | 71.8% | 66.8% |
| RiemannBench | 80.0% | 76.0% | 72.0% | 69.6% |
| Terminal-Bench-Science 0.1 (AA) | 64.8% | 52.9% | 63.3% | 59.0% |
| CWE-bench | 71.0% | 68.0% | 68.0% | 67.0% |
| ExploitGym | 54.8% | 42.0% | 42.4% | 34.5% |
| SEC-bench Pro | 88.2% | 83.4% | 85.4% | — |

The first thing to notice is that Carbon beats Argon on every row. That is a clean sweep of the comparison, but it is not a clean sweep of the market. On FrontierSWE 2, GPT-6 Astra is first at 65.5% and Claude Opus 5.5 is second at 62.3%, ahead of Carbon's 61.2%. On OSWorld-2.1, Carbon beats Argon and GPT-6 Astra but trails Claude Opus 5.5 at 87.2%. On the Vals Index, Carbon's 70.4% is a 0.2-point lead over Claude Opus 5.5 and a 1.2-point lead over Argon, which is effectively a tie at the top.

The second thing to notice is the shape of the gains. Carbon's largest improvements over Argon are in tasks that require sustained action: exploitation (+12.8 points), long-context retrieval (+12.0), science in a terminal (+11.9), agents' last exam (+8.4), terminal use (+8.1), computer use (+6.8), and SWE-sweep (+5.3). Its smallest gains are in knowledge work and multimodal understanding: AutomationBench (+2.6), Vals (+1.2), Chartography (+0.9), and CWE-bench (+3.0). Carbon is not uniformly better; it is better in the places Google optimized.

## Where Carbon improves over Argon

The most useful way to read the table is by workload, not by the composite score.

**Agentic coding.** SWE-sweep rises from 4.3% to 9.6%, and Terminal-Bench 4.0 rises from 57.1% to 65.2%. Agents' Last Exam, which tests long-horizon computer use and tool sequencing, rises from 69.0% to 77.4%. These are the benchmarks closest to an agent that has to plan, edit, run commands, inspect results, and recover from failure. Carbon's improvement is meaningful, but the absolute SWE-sweep score is still low; these are hard tasks, and no model is close to solving them reliably. The same tool-loop discipline is the subject of the [AI agents guide](/blog/ai-agents-beginners-guide-architecture-tools-workflows), which is worth reading before attributing an agent's failure to the model.

**Long context.** GraphWalks tests retrieval and reasoning across contexts from 256k to 1M tokens. Carbon scores 96.2% versus 84.2% for Argon, a 12-point gap that is one of the clearest wins in the table. If your workflow involves large codebases, long audit trails, or multi-document research, Carbon's long-context behavior is the most relevant improvement.

**Science and math.** RiemannBench rises from 76.0% to 80.0%, and Terminal-Bench-Science rises from 52.9% to 64.8%. The latter is a large relative jump, and it fits Google's positioning of Carbon as a model for sustained technical work rather than short answers.

**Cybersecurity.** The headline numbers are SEC-bench Pro at 88.2% for finding vulnerabilities, ExploitGym at 54.8% for exploitation, and CWE-bench at 71.0% for patching. Against Argon, that is +4.8, +12.8, and +3.0 points respectively. The exploitation gain is the largest, which matters because validating whether a vulnerability is actually exploitable is a separate skill from finding it. CWE-bench is the smallest gain, which is a reminder that patching remains hard even when discovery improves.

**Knowledge work and computer use.** AutomationBench rises from 51.3% to 53.9%, and Vending-Bench 2 rises from $13,718 to $16,484. These are real improvements, but they are incremental rather than transformative. OSWorld-2.1 rises from 74.7% to 81.5%, which is a solid gain, but Claude Opus 5.5 still leads at 87.2%.

**Web development.** Carbon reached 1,768 Elo on WebDev Arena, a +89 improvement over Argon and fourth place at launch. That is a good result, but it is not a category lead. If web development is your primary workload, the benchmark is telling you that Carbon is better than Argon but not necessarily the best model available.

## Where Carbon still trails

The comparison is more interesting where Carbon does not win.

**FrontierSWE 2.** Carbon scores 61.2%, Argon 55.0%, GPT-6 Astra 65.5%, and Claude Opus 5.5 62.3%. Carbon is third. This is a real-world software engineering benchmark, and it is the clearest evidence that Carbon's advantage is not universal. If your work looks more like FrontierSWE 2 than like Terminal-Bench or SWE-sweep, the composite score is not enough to justify switching.

**OSWorld-2.1.** Carbon scores 81.5%, Argon 74.7%, GPT-6 Astra 80.9%, and Claude Opus 5.5 87.2%. Carbon is second. Computer use is a broad category, and Claude's lead here is large enough to matter for agents that spend most of their time operating a desktop or a browser.

**The composite index.** Carbon's 59 versus Claude Opus 5.5's 58 is a one-point lead. Tom's Hardware described it as "narrowly beating" Claude, and that framing is fair. A one-point difference on a composite index can disappear when your workload weights the subtests differently. The index is a summary, not a specification.

**Access and evidence.** Argon has weeks of public usage and a broad API. Carbon has a limited rollout and vendor-run benchmarks. The lack of independent, large-scale user evidence is a real disadvantage, even if the launch numbers are strong. The cybersecurity benchmarks were evaluated without guardrails, so the deployed model may behave differently under safety filters.

## Safety and alignment

Carbon's safety story is one of the strongest parts of the launch. Google says it builds on Argon's multi-layered stack and improves on it in several specific ways:

- **Indirect prompt injection.** Carbon achieved 0.0% attack success on the Gray Swan Indirect Prompt Injection benchmark, versus 0.7% for Argon. That is a small absolute difference, but it is the difference between "one known successful attack" and "none in the evaluated set."
- **Cheating and shortcuts.** Carbon reduced successful cheating on Terminal-Bench 4.0 to 0.0%, with attempts at 0.4%. In internal live coding environments, high-severity misalignment alerts dropped by almost 80%.
- **Honesty.** Google says Carbon cuts unsupported claims by roughly 2x over Argon. It puts methodological caveats into the deliverable or withholds blocked actions with a clear list of what remains required, rather than fabricating or hedging around missing evidence.
- **Scope discipline.** Carbon reduced overreach by 26% and under-service by 29%, according to Google. In practice, that means it is less likely to do work the user did not ask for, and less likely to stop short of the work the user did ask for.
- **Ambiguity.** When instructions are unclear, Carbon is trained to retrieve relevant sources and surface discrepancies before acting, rather than guessing.

These are vendor-reported results, and the usual caveats apply: benchmark design, evaluation conditions, and internal test sets can flatter a model. But the direction is consistent with the rest of the launch. Carbon is not just a more capable model; it is a model Google is trying to make more reliable in agentic settings before it gives it to a wider audience.

The limited rollout is part of that safety story. A model that can find and exploit vulnerabilities is dual-use. Google is starting with defenders, gathering feedback, and expanding through Fairwind rather than opening a public API on day one. That is a defensible choice, even if it frustrates developers who want the benchmark winner today.

## Pricing and access

Carbon and Argon share the same price structure, which makes the access difference the main practical decision.

| | Gemini 4 Carbon | Gemini 4 Argon |
| --- | --- | --- |
| Status | Limited to cyber defenders and trusted partners via Fairwind; no general availability date | Generally available through the Gemini API, AI Studio, the Gemini platform, and eligible consumer and enterprise surfaces |
| Introductory input price | $2 per million tokens | $2 per million tokens |
| Introductory output price | $10 per million tokens | $10 per million tokens |
| Later input price | $4 per million tokens | $4 per million tokens |
| Later output price | $20 per million tokens | $20 per million tokens |
| Cached input | 95% discount | 95% discount |
| Introductory period ends | Not specified | 30 November 2026 |
| Context | Built on Argon; GraphWalks tested from 256k to 1M tokens | 1M unified input-output token budget via the Gemini API |
| Announcement | 28 October 2026 | 30 September 2026; global availability 13 October 2026 |

The pricing is identical on paper, but the cost per task can differ because the models take different paths to an answer. An independent SemiAnalysis GDPx benchmark, reported by 9to5Google, put Carbon just behind Claude Opus 5.5 on score but at roughly $16 per task versus about $51 for Claude. Argon ranked eighth on that benchmark and cost slightly less than Carbon. That is a useful reminder that list price per token is not the same as cost per completed task. The pricing also arrives in a market that is repricing AI capex; the [China AI bubble burst](/blog/china-ai-bubble-burst-480-billion-repricing) explains why buyers are asking for cost per task, not just benchmark scores.

For most teams, the decision is not close today. Argon is available, documented, and integrated into Google's product surfaces. Carbon is a preview for defenders. If you are building a general-purpose agent, start with Argon and revisit Carbon when access opens. If you are on a security team, the Fairwind Program is the route to evaluate Carbon now.

## Which should you use?

The right choice depends on the workload, not the composite score.

| Workload | Better fit | Why |
| --- | --- | --- |
| General coding and code review | Argon today; Carbon when available | Carbon improves on most coding benchmarks, but FrontierSWE 2 shows GPT-6 Astra and Claude Opus 5.5 ahead. |
| Long-horizon agentic engineering | Carbon, if you can get access | SWE-sweep, Terminal-Bench, Agents' Last Exam, and GraphWalks all improve substantially over Argon. |
| Cybersecurity defense | Carbon | SEC-bench Pro, ExploitGym, and CWE-bench are the strongest parts of the launch, and the model is being rolled out to defenders first. |
| Enterprise knowledge work | Argon today; Carbon if access | AutomationBench and Vals improve, but the gains are incremental and Argon is available. |
| Long-context research | Carbon, if access; Argon otherwise | GraphWalks 96.2% vs 84.2% is a real gap, but Argon is already strong at 1M-class context. |
| Web development | Argon today; Carbon if access | Carbon's WebDev Arena score is better, but it is fourth, not first. |
| Production reliability | Argon today | More deployment history, broad API access, and a mature support surface. |

For enterprise pipelines, the [Harness AI DevOps guide](/blog/harness-ai-devops-agents-guide) covers the orchestration layer around a model like this: the scheduler, the approvals, and the observability that a benchmark does not measure.

The broader lesson is that model comparisons are workload-specific. A single index can tell you which model is best on average, but it cannot tell you which model is best for your codebase, your security posture, or your agent's tool loop. Carbon's launch is a good excuse to run your own evaluation, not a reason to skip one.

## Frequently asked questions

### What is Gemini 4 Carbon?

Gemini 4 Carbon is Google DeepMind's frontier model announced on 28 October 2026, two weeks after Gemini 4 Argon. It is built for long-horizon engineering and defensive cybersecurity, and Google says it is its strongest model, ranking first on the Artificial Analysis Intelligence Index v5.0 at 59.

### How is Carbon different from Argon?

Carbon is a cybersecurity-first specialist built on Argon. It improves on Argon across most of Google's published benchmarks, especially agentic coding, long-context retrieval, science, and vulnerability discovery, exploitation, and patching. Argon is the general-purpose model that is broadly available today; Carbon is limited to vetted cyber defenders through the Fairwind Program.

### Is Carbon better than Argon?

On Google's published benchmark table, Carbon beats Argon on every row, including a 59 to 50 lead on the Artificial Analysis Intelligence Index and a 71.0% to 68.0% lead on CWE-bench. The gains are workload-specific, and Carbon does not win every comparison against rivals: GPT-6 Astra leads FrontierSWE 2, and Claude Opus 5.5 leads OSWorld-2.1.

### Can I use Carbon today?

Not generally. Carbon is being released first to a subset of cyber defenders and then to additional trusted partners through Google's Fairwind Program. Google has not announced a general availability date for developers, businesses, or consumers. Argon is available now through the Gemini API, AI Studio, the Gemini platform, and eligible consumer and enterprise surfaces.

### How much does Carbon cost?

Carbon has the same introductory price as Argon: $2 per million input tokens and $10 per million output tokens, with cached input tokens at a 95% discount. After the introductory period, the listed price is $4 per million input and $20 per million output tokens. Google has not specified when Carbon's introductory period ends; Argon's introductory price ends on 30 November 2026.

### Is Carbon safer than Argon?

Google reports better safety metrics for Carbon, including 0.0% indirect prompt-injection attack success versus 0.7% for Argon, 0.0% successful cheating on Terminal-Bench 4.0, roughly half as many unsupported claims, and an almost 80% drop in high-severity misalignment alerts in internal live coding. These are vendor-run evaluations; independent testing and broader deployment will matter more than the launch numbers.

### Does Carbon have a 1M context window?

Google has not published a separate context limit for Carbon. It is built on Argon, whose Gemini API budget is a 1M unified input-output token limit, and Carbon's GraphWalks result covers 256k to 1M tokens. Treat 1M as the tested long-context range, not a separate Carbon specification.

## Sources and further reading

- [Google DeepMind: Gemini 4 Carbon, our next frontier model](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/)
- [Google DeepMind: Gemini 4 Argon, our next era of frontier intelligence](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/)
- [Google DeepMind: Gemini 4 Argon, built to solve your hardest problems](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/)
- [Google DeepMind: Gemini 4 Carbon evaluation methodology](https://deepmind.google/models/evals-methodology/gemini-4-carbon)
- [Tom's Hardware: Google reveals Gemini 4 Carbon, narrowly beating Claude Opus 5.5](https://www.tomshardware.com/tech-industry/artificial-intelligence/google-reveals-new-gemini-4-carbon-ai-model-narrowly-beating-claude-opus-5-5-frontier-ai-model-is-also-the-least-likely-to-hallucinate-benchmarks-claim)
- [9to5Google: Gemini 4 Carbon lags just behind Claude in benchmark, but wins in value](https://9to5google.com/2026/11/02/gemini-4-carbon-benchmark/)
- [TechGenyz: Gemini 4 Carbon vs Argon, what has actually improved](https://techgenyz.com/google-gemini-4-carbon-vs-argon-what-improved/)
- [Our Gemini 4 Argon deep dive](/blog/gemini-4-argon-google-frontier-model-reasoning-coding-cybersecurity)
