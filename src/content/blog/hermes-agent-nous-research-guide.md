---
title: "Hermes Agent: Inside Nous Research's Self-Improving Open-Source Agent"
description: "An architectural guide to Nous Research's Hermes Agent: native function calling in Hermes 3, self-improving skills loops, and sandboxed tool execution."
status: published
category: buying-basics
tags: ["buying-basics", "ai", "developer-tools", "agents"]
pubDate: 2026-10-25T14:10:00.000Z
updatedDate: 2026-10-25T14:10:00.000Z
coverUrl: /media/hermes-agent-nous-research.jpg
coverAlt: "Nous Research Hermes Agent terminal interface and function calling graph"
noindex: false
affiliate: false
slug: hermes-agent-nous-research-guide
faq:
  - question: "What makes Hermes Agent different from standard LLM chatbots?"
    answer: "Hermes Agent operates as a persistent execution harness with native XML structured token parsing (<tool_call>, <SCRATCHPAD>) and a self-improving skill loop that stores verified workflows for future reuse."
  - question: "Can Hermes Agent run with local open-weights models?"
    answer: "Yes, it is designed around the open-weights Hermes 3 model family (8B, 70B, and 405B) and runs on local hardware or private servers via Ollama, vLLM, or LM Studio without vendor lock-in."
---

## Quick answer

- **Core engine:** Hermes 3 open weights (8B, 70B, 405B) with native XML tool tokens.
- **Learning loop:** Autonomous skill synthesis into reusable procedural memory files.
- **Sandboxing:** Docker, Modal, and Daytona backends with path and secret filtering.
- **Gateway hub:** Headless daemon bridging terminal, Telegram, Discord, and Slack.

Standard chatbot wrappers collapse when executing complex engineering workflows. A typical chat interface operates within an ephemeral session: it accepts user input, uses regex to intercept function calls, runs a command, and dumps context once the session ends. When an external API fails or a terminal script throws an error, stateless wrappers lack the context to diagnose the issue and devolve into hallucination loops.

Nous Research resolves this with **Hermes Agent**, an open-source stateful execution harness (a persistent software environment that manages process lifecycles, memory, and tool interactions across distinct task runs). By pairing the native ChatML token capabilities of the Hermes 3 model family with persistent procedural memory and sandboxed runtimes, Hermes Agent transforms open-weights models into reliable, autonomous operational partners.

## How does Hermes 3 handle structured function calling natively?

Most open-source agent setups prompt general-purpose models to output JSON text blobs. This produces frequent schema mismatches and unescaped character exceptions. Hermes 3 eliminates this fragility through native function calling (an LLM capability to output structured JSON arguments to trigger external APIs) baked directly into the model's tokenizer and training weights.

Tool definitions are passed within `<tools>` XML tags in the system prompt. When executing a tool, the model emits an inner monologue (internal reasoning traces wrapped in tags like `<SCRATCHPAD>` before final execution) to evaluate requirements before outputting a `<tool_call>` block:

```xml
<|im_start|>assistant
<SCRATCHPAD>
Checking repository status using execute_command.
</SCRATCHPAD>
<tool_call>
{"name": "execute_command", "arguments": {"command": "git status --short"}}
</tool_call><|im_end|>
```

The harness leverages native token parsing (decoding raw model generation streams into programmatic data structures without brittle regex post-processing). Once intercepted, Hermes Agent runs Pydantic validation (runtime data parsing and type validation for Python) to verify parameter types before executing the tool. The result returns in a structured `<tool_response>` block, maintaining schema adherence across 8B, 70B, and 405B model weights.

## How do prompt wrappers, ReAct loops, and Hermes Agent compare?

Engineers selecting an agent architecture should evaluate how each system handles execution state, errors, and learning.

| Feature | Standard Prompt Wrapper | Generic ReAct Loop | Hermes Agent Autonomous Harness |
| :--- | :--- | :--- | :--- |
| **Tool invocation** | Unstructured JSON regex extraction | Text pattern extraction | Native `<tool_call>` tokens with Pydantic validation |
| **Reasoning trace** | None | Freeform scratch text | Native `<SCRATCHPAD>` inner monologue tokens |
| **Session state** | Ephemeral; discarded on close | Ephemeral; lost on process exit | SQLite-backed relational memory across all sessions |
| **Skill learning** | None | Temporary in-memory definitions | Autonomous procedural skill synthesis (`SKILL.md`) |
| **Execution isolation**| Direct host shell access | Raw subprocess execution | Container isolation (Docker, Daytona, Modal) |
| **Gateway routing** | Single web chat UI | Single terminal process | Multi-channel daemon (CLI, Telegram, Discord) |

While generic ReAct loops (iterative "Reason, Act, Observe" control loops) provide basic tool sequencing, they lack lifecycle memory and fail under extended multi-step horizons.

## How does the persistent skill learning loop improve performance over time?

The fundamental cost in agentic computing is the cold-start penalty: an agent re-discovering how to perform the same sequence from scratch every session. Hermes Agent eliminates this overhead using procedural memory (the automated storage of executable step-by-step techniques and tool protocols).

When resolving an unfamiliar workflow, Hermes Agent explores the task step by step. Upon successful verification, it executes skill acquisition (compiling successful multi-step execution workflows into permanent reusable routines):

1. **Extraction:** The agent extracts the validated command sequence and environment prerequisites.
2. **Formatting:** It compiles the workflow into a `SKILL.md` file featuring YAML metadata and modular functions.
3. **Indexing:** The skill is registered in `~/.hermes/skills/` for instant local lookup.
4. **Autonomous reuse:** On future prompts, the agent consults its skill index and executes the cached workflow directly, reducing token consumption.

Hermes Agent records successful trajectories in the ShareGPT trajectory format (a standardized JSON schema for multi-turn conversational and agentic training data). Teams can export these datasets directly into reinforcement learning frameworks like Atropos to fine-tune specialized models.

## What sandboxing safeguards protect local and VPS execution environments?

Granting an LLM autonomous terminal access presents serious security risks. Hermes Agent prevents catastrophic errors through container isolation (running processes inside restricted namespaces with bounded CPU, memory, and filesystem access).

The harness routes all code execution through four selectable backends:

- **Local constrained sandbox:** Enforces path boundaries and requires interactive confirmation for destructive commands (`rm`, `dd`, `mkfs`).
- **Docker container backend:** Launches disposable containers with bounded CPU and memory, mounting only targeted project directories.
- **Serverless cloud sandboxes (Daytona & Modal):** Provisions ephemeral execution sandboxes that spin down when idle to eliminate standing server costs.
- **Environment protection:** Blocks external tools from reading host authorization secrets via strict `env_passthrough` allowlists.

## How does Hermes Agent interface with messaging platforms like Telegram and Discord?

Hermes Agent functions as a continuous operational teammate. It includes a unified messaging gateway that runs as a daemon process (a background service that runs continuously without an active terminal session).

Running `hermes gateway setup` configures authenticated connections to Telegram, Discord, Slack, and WhatsApp. The gateway supports:

- **Isolated multi-user context:** Maintains dedicated memory threads and workspace paths per chat channel.
- **Automated cron jobs:** Runs scheduled tasks—such as dependency updates or RSS summaries—without external cron managers.
- **Inbound webhooks:** Listens on an authenticated HTTP port to trigger automated workflows from GitHub webhooks or CI/CD alerts.

## Deployment checklist: how do you set up Hermes Agent in production?

Follow this checklist to deploy Hermes Agent on Linux, macOS, or WSL2.

- [ ] **Step 1: Configure inference endpoint** — Deploy Hermes 3 on vLLM (`vllm serve NousResearch/Hermes-3-Llama-3.1-70B --enable-auto-tool-choice`) or configure an API key for OpenRouter or Nous Portal.
- [ ] **Step 2: Install Hermes Agent** — Run the non-root installer script: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`.
- [ ] **Step 3: Complete base setup** — Run `hermes setup` to set default models, workspace directories, and prompt preferences.
- [ ] **Step 4: Enable container isolation** — Set `backend: docker` in `~/.hermes/config.yaml` and define container memory caps and volume mounts.
- [ ] **Step 5: Initialize skill repository** — Verify directory permissions for `~/.hermes/skills/` and test retrieval with `hermes skill sync`.
- [ ] **Step 6: Launch messaging gateway** — Configure bot tokens with `hermes gateway setup` and start the daemon with `hermes gateway start --daemon`.

## If the free fixes are not enough

When deploying Hermes Agent at scale, technical teams often encounter operational edge cases that require infrastructure adjustments.

| Developer / Operator Situation | Root Cause | Matching Production Solution |
| :--- | :--- | :--- |
| **High latency during iterative tool loops** | 70B/405B model queried for simple routing decisions | Implement a two-tier model router: dispatch simple tool calls to Hermes 3 8B and complex reasoning to 70B. |
| **Execution security risks in shared hosting** | Local execution backend active without container fencing | Switch `config.yaml` to `docker` or `daytona` with non-root UID execution and read-only host mounts. |
| **Context exhaustion during long debug sessions** | Multi-step shell outputs filling context window | Enable trajectory compaction and persist intermediate data to local SQLite procedural storage. |
| **Gateway service termination on host reboot** | Daemon started manually within a temporary terminal shell | Register Hermes Gateway as a systemd unit (`systemctl enable --now hermes-gateway`) with automatic restarts. |

## Sources and citations

- **Nous Research Hermes 3 Technical Report:** Teknium, et al. (2024). *Hermes 3: Technical Report on Open-Weights Agentic and Reasoning Capabilities*. arXiv:2408.11596. [Nous Research Paper](https://arxiv.org/abs/2408.11596).
- **Hermes Agent Source Repository:** Nous Research. *Hermes Agent: The Open-Source Autonomous Agent Harness*. GitHub: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).
- **Hermes Function Calling Specification:** Nous Research. *Hermes Function Calling Dataset and Templates*. Hugging Face: [NousResearch/hermes-function-calling](https://huggingface.co/datasets/NousResearch/hermes-function-calling).
- **Hermes 3 Model Documentation:** Nous Research. *Hermes-3-Llama-3.1-8B, 70B, and 405B Model Cards*. Hugging Face: [NousResearch/Hermes-3-Llama-3.1-70B](https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-70B).
