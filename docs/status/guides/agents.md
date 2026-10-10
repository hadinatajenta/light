# Agents

Agents automate the content pipeline: drafting guides, reviewing drafts, running quality checks, and collecting research. This guide covers how to set them up and what to expect from each run.

## Prerequisite: save a DeepSeek API key

Agents call the DeepSeek API. Before you run any agent, save a key:

1. Open the **Agents** page (`/dashboard/agents`).
2. In the **DeepSeek API key** card, paste your key and click **Save key**.

The key is validated against the real DeepSeek API at save time, then stored encrypted in D1 using AES-GCM with the `AGENT_SECRET_KEY` Worker secret. It is never returned to the browser in full. The card only ever shows a masked hint such as `sk-...abcd`. Use **Replace key** to change it.

You can get a key from the DeepSeek platform, linked from the card.

## Create an agent

Go to **Agents** and click **New agent** (`/dashboard/agents/new`). The form has these fields:

- **Name**: a label for the agent, up to 80 characters.
- **Role**: Writer, Reviewer, QC, or Scrapper. The description under the field explains the role, and the form prefills the default prompt for the role.
- **Prompt**: the role prompt. Each role has a default you can edit. Your text is appended to the role's built-in instructions.
- **Model**: `deepseek-flash` (the default) or `deepseek-v4-pro`.
- **Runs per day**: between 1 and 24.
- **Enabled**: whether the schedule runs this agent.
- **Auto publish approved drafts**: shown only for the Reviewer role. Ignored and forced off for the other roles.

You can create at most **6 agents**. When you reach the limit, the New agent button is disabled and reads "You reached the limit of 6 agents. Delete one to add another."

## The four roles

Each run of an agent does one job, based on its role.

### Writer

- Produces a **draft** post, never a published one.
- The prompt topic tells it what to write about. The writer is also given the titles of the last 12 published posts and told not to duplicate them.
- It returns a title, a description, 2 to 4 tags, and a markdown body. The body is saved as a new post with status `draft` and review status `pending`.
- Model effort: **high**.

### Reviewer

- Works on the **oldest pending draft** (a draft whose review status is empty or `pending`).
- Decides to approve or request changes. On "request changes" it writes the revised body back to the draft and sets the review status to `changes_requested`.
- On approve it sets the review status to `approved`. If **Auto publish approved drafts** is enabled on this reviewer, it then publishes the post. Otherwise the post stays a draft until a human publishes it.
- Model effort: **high**.

### QC

- Audits the **oldest pending draft** for title length, description length, heading structure, word count, placeholder text, and any claim that looks unverifiable.
- Reports the issues it finds. It does **not** change the draft or its review status, so a reviewer still sees the same draft as pending.
- Model effort: **high**.

### Scrapper

- Collects research notes for the topic in the prompt, as a list of heading and detail pairs.
- The notes are stored on the run record, not saved as a post. Read them from the run history.
- Model effort: **low**.

Note: effort is a property of the role, not the model. The model choice is `deepseek-flash` or `deepseek-v4-pro`.

## The review gate

A writer only ever produces drafts. A draft becomes published only when **both** of these are true:

1. A reviewer approves it, and
2. That reviewer has **Auto publish approved drafts** enabled.

This is enforced in the server code, not in the browser. The writer, QC, and Scrapper roles can never publish, and turning on auto publish has no effect on them. If you want a human to publish every post, leave auto publish off and click Publish in the post editor yourself.

## How scheduling works

- A separate cron Worker (`light-agents`) runs every 15 minutes.
- On each tick it calls `POST https://lightscripts.com/api/agents/run-due` with a bearer token.
- The endpoint finds every **enabled** agent whose `nextRunAt` is due or empty, and runs them in order.
- A newly created enabled agent has `nextRunAt` set to its creation time, so it is **due immediately** and runs on the next 15-minute tick.
- After each run, the next run time is set to now plus `24 hours / runs per day`. A 24-per-day agent is spaced one hour apart; a 1-per-day agent once a day.
- The endpoint has a time budget of about 110 seconds. If many agents are due at once, it processes as many as fit and reports how many were left.

When you save an agent, its next run time is recomputed, so editing an agent resets its schedule from that moment.

## Run an agent manually

On the Agents page, each card has a **Run agent** button. It runs the agent immediately, regardless of its schedule.

- On success, a toast shows the run summary, for example `Drafted "Best standing desks"` or `Passed QC on "..."`.
- On failure, a toast shows the error.
- The card and the run history refresh afterwards.

This button is the fastest way to test a prompt without waiting for the schedule.

## Where to see history

- **Edit page run history**: open an agent's edit page to see its last 10 runs, each with the start time, status (Running, Succeeded, Failed), token usage, the summary, and any error.
- **Activity page**: every run also writes an activity entry (`agent.writer`, `agent.reviewer`, `agent.qc`, `agent.scrapper`) under the agent's name. Filter by Agents, or by a single agent, on `/dashboard/activity`.

## Troubleshooting

- **No DeepSeek key**: runs fail with `DEEPSEEK_KEY_MISSING`, "Add your DeepSeek API key before running an agent." Save a key on the Agents page.
- **Invalid key**: saving a bad key fails validation with `DEEPSEEK_UNAUTHORIZED`, "The DeepSeek API key was rejected." A key can also be rejected at run time if it was revoked. Replace it.
- **Out of balance**: `DEEPSEEK_INSUFFICIENT_BALANCE`, "The DeepSeek account has no balance." Top up the DeepSeek account.
- **Rate limit (429)**: `DEEPSEEK_RATE_LIMITED`, "DeepSeek rate limit reached." Wait and run again, or lower the runs per day.
- **Timeout**: `DEEPSEEK_TIMEOUT`, "The DeepSeek request timed out." The request has a 180 second limit. Try again or simplify the prompt.
- **Unreachable**: `DEEPSEEK_UNREACHABLE`, "Could not reach the DeepSeek API." Likely a temporary network problem.
- **Agent limit reached**: `AGENT_LIMIT_REACHED`, "You can create at most 6 agents." Delete an agent before creating another.
- **Nothing to do**: a reviewer or QC run with no pending draft returns "No pending draft to process". That is a success, not an error.
- **Invalid model output**: `MODEL_OUTPUT_INVALID` means the model did not return usable JSON. Run the agent again.

## Not built yet

- There is no per-agent pause between runs beyond the daily schedule, no run-on-demand queue, and no retry policy. A failed run is recorded and then waits for the next scheduled tick.
- There is no cost or spend report. Token counts are shown per run only.
