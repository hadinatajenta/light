# Agents

Agents automate the content pipeline: drafting guides, reviewing drafts, running quality checks, and collecting research. This guide covers how to set them up and what to expect from each run.

## Prerequisite: save a DeepSeek API key

Agents call the DeepSeek API. Before you run any agent, save a key:

1. Open the **Agents** page (`/dashboard/agents`).
2. In the **DeepSeek API key** card, paste your key and click **Save key**.

The key is validated against the real DeepSeek API at save time, then stored encrypted in D1 using AES-GCM with the `AGENT_SECRET_KEY` Worker secret. It is never returned to the browser in full. The card only ever shows a masked hint such as `sk-...abcd`. Use **Replace key** to change it.

You can get a key from the DeepSeek platform, linked from the card.

## Prerequisite: connect a search provider

The scrapper researches the live web. Before it can run, connect a search
provider:

1. On the **Agents** page, in the **Search provider** card, pick a provider.
2. Paste its API key and click **Save provider**.

The key is validated with a probe search at save time, then stored encrypted in
D1 the same way as the DeepSeek key. Tavily ships first; a `fixture` provider is
available for local development and reads `SEARCH_FIXTURE_JSON` from the
environment. When no provider is configured the **Search provider** card shows a
warning and scrapper runs are recorded as **Skipped** instead of failing.

## Create an agent

Go to **Agents** and click **New agent** (`/dashboard/agents/new`). The form has these fields:

- **Name**: a label for the agent, up to 80 characters.
- **Role**: Planner, Writer, Reviewer, QC, or Scrapper. The description under the field explains the role, and the form prefills the default prompt for the role.
- **Prompt**: the role prompt. Each role has a default you can edit. Your text is appended to the role's built-in instructions. For the Planner, this field is where the seed keywords live.
- **Categories**: shown only for the Writer role. Tick every category this writer owns, its beat. The writer claims topics from any ticked category, so two writers can work in parallel without competing for the same queue. No box ticked means the writer may claim a topic from any category.
- **Model**: `deepseek-flash` (the default) or `deepseek-v4-pro`.
- **Runs per day**: between 1 and 24.
- **Enabled**: whether the schedule runs this agent.
- **Auto publish approved drafts**: shown only for the Reviewer role. Ignored and forced off for the other roles.

You can create at most **12 agents**, with a per role cap: planner 2, scrapper 2,
writer 4, qc 2, reviewer 2. When a cap is reached, the New agent button is
disabled and names the role limit that was hit.

## The five roles

Each run of an agent does one job, based on its role.

### Planner

- Runs first in the tick. It does not claim a topic, it creates them.
- Reads the union of every enabled writer's categories (their beats), the queued topic titles, and the published article titles. When no writer has a beat yet it falls back to the categories that already have published posts.
- Asks the model for 5 to 8 topics in those categories, each with a title, a category, an intent, and 2 to 5 lowercase keyword phrases.
- Drops any proposal with an unknown category, a duplicate title (against queued topics and published articles alike), or fewer than 2 keywords, and caps a run at 8 topics. Each accepted topic is queued with the planner recorded as its author, which is what the scorecard counts as topics proposed.
- The keywords you put in the agent's **Prompt** field are the seeds. Broaden them into the questions a buyer would actually ask.
- Model effort: **high**.

### Writer

- Produces a **draft** post, never a published one.
- Claims the oldest queued topic **in one of its categories** when it has a beat, otherwise the oldest queued topic of any category. When the queue is empty it looks for a draft whose review status is `changes_requested` and revises that instead.
- The prompt topic tells it what to write about. The writer is also given the titles of the last 12 published posts and told not to duplicate them.
- It returns a title, a description, 2 to 4 tags, and a markdown body. The body is saved as a new post with status `draft` and review status `pending`.
- Model effort: **high**.

### Reviewer

- Claims the **oldest pending draft** (a draft whose review status is empty or `pending`) atomically, so two reviewers never work on the same draft at the same time. The claim is `in_review` while the model runs, released on failure or by the reaper after twenty minutes.
- Decides to approve or request changes. On "request changes" it writes the revised body back to the draft and sets the review status to `changes_requested`.
- A deterministic preflight runs before every approval. While the draft still has a hard error (title or description length, a body under 600 words, an H1 heading, fewer than three H2 sections, or placeholder text) the reviewer refuses to approve and sends the draft back with the issue list instead.
- On approve it sets the review status to `approved`. If **Auto publish approved drafts** is enabled on this reviewer, it publishes immediately. Otherwise the scheduled publisher publishes it on the next tick once its publication date has passed.
- Model effort: **high**.

### QC

- Claims a pending draft, so the QC and a reviewer cannot audit the same draft at once.
- Audits it for title length, description length, heading structure, word count, placeholder text, and any claim that looks unverifiable, and merges the model findings with the deterministic preflight.
- When anything is flagged it sets the review status to `changes_requested` with the issue list as the review notes, so the writer revises it and no reviewer sees it as pending. When nothing is flagged the claim is released and the draft stays pending.
- Model effort: **high**.

### Scrapper

- Runs a real web search and fetches the pages it finds. It does not write notes from model memory.
- It plans 3 to 5 search queries, each targeting a different angle: specifications, compatibility, durability, standards, and misleading claims. Duplicate queries are removed before searching.
- It searches with the configured provider and ranks the results. The ranking pushes down affiliate pages, listicles, coupon and deal pages, and marketplace listings, and lifts standards bodies, government and regulator guidance, and manufacturer documentation.
- It then writes research notes from the fetched text. Every note must cite a fetched source URL, carry a short verbatim quote, name its angle, and name its source type (manufacturer, independent, standard, government, retailer, or other).
- Notes are written one fact at a time. A fact already covered by another note or source is not repeated.
- The code verifies each quote against the page it cites. A note with an unsupported quote is dropped. A topic with no verifiable note is **Blocked**, not written.
- When an angle has no verified note, the scrapper saves a coverage-gap note so the writer can see which part is thin.
- Notes are saved to the topic's **Research notes**, which the writer reads on its next run. Open them from the topics list.
- You can add a source URL by hand in the research notes dialog. The scrapper fetches it on its next run, so the scrapper stays useful even without a provider.
- Model effort: **low** for query planning, **high** for note writing.

Because research is split into phases, a run advances as far as its time budget allows. A topic can rest in **Fetched** between runs while it waits to fetch more pages or to write notes, then becomes **Researched** when verified notes exist.

Note: effort is a property of the role, not the model. The model choice is `deepseek-flash` or `deepseek-v4-pro`.

## The review gate

A writer only ever produces drafts. A draft becomes published only when **both** of these are true:

1. A reviewer approves it, and
2. That reviewer has **Auto publish approved drafts** enabled.

This is enforced in the server code, not in the browser. The planner, writer, QC, and Scrapper roles can never publish, and turning on auto publish has no effect on them. If you want every post to wait for you, keep the review status at `pending` and publish by hand from the post editor: once a reviewer approves a draft, the scheduled publisher publishes it as soon as its publication date has passed, whether or not auto publish is enabled.

A second gate protects against unverified research. The writer only receives research notes marked **Verified**. If a topic has no verified note, the writer is told to return `NEEDS RESEARCH` and the topic is blocked. A reviewer approves the draft but skips auto publish when the draft's topic has no verified source. The scheduler enforces the same gate, so an approved draft whose topic has no verified source is not published on the schedule either. A draft can never reach the site on unverified research unless a human publishes it by hand.

## Spending budget

Agents call paid services: Tavily for search and DeepSeek for model tokens. The
**Spending budget** card on the Agents page keeps those from draining your card.

- **Daily searches**: the most Tavily searches allowed in one day.
- **Monthly searches**: the most in one calendar month. A basic search costs one
  Tavily credit, so set this to your free credit balance, 1,500, if you want a
  hard stop and no charges.
- **Daily tokens**: the most DeepSeek tokens across all runs in one day.
- **Daily covers**: the most auto-generated cover images in one day, 20 by
  default, which keeps Workers AI image generation inside the free quota.
- **Free credits per month**: the Tavily free allowance, 1,500 credits, which
  resets on the calendar month and does not roll over.
- **Price per credit (USD)**: the rate billed beyond the free allowance, $0.008
  per credit.
- **Pause all spending**: stops every agent run and search immediately.

The card shows the free credits used and the estimated cost once the free
allowance is passed, and it warns when the free credits are nearly used up
(about 80 percent). The account has pay as you go enabled, so usage beyond the
free allowance is billed at $0.008 per credit. As a second layer, also enable a
spending limit in the Tavily billing dashboard.

When a search limit is reached, the scrapper stops searching and leaves the topic
for when the budget resets. When the token limit is reached, agent runs are
recorded as **Skipped** and make no model call. Lower the limits at any time; the
counts reset on the calendar day and month.

The daily search cap is the real limit on research, not the scrapper's runs per
day. One scrapper run costs three to five searches, so the default cap of 40 is
reached after roughly eight to thirteen runs, and later runs that day are
recorded as **Skipped**. Keep the scrapper's runs per day near `daily searches / 4`
(for example 10 runs for a cap of 40), or raise the cap within the monthly free
allowance. Tokens are usually far from their cap: a normal day of drafting and
reviewing spends well under a tenth of the default two million.

Planner runs are cheap in tokens but expensive in queue: one run proposes up to
eight topics, while the scrapper can only research about `daily searches / 4`
topics a day. Set the planner to one or two runs a day and let research be the
pace, so the queue stays short instead of filling with topics nothing can reach.

## How scheduling works

- A separate cron Worker (`light-agents`) runs every 15 minutes.
- On each tick it calls `POST https://lightscripts.com/api/agents/run-due` with a bearer token.
- The endpoint finds every **enabled** agent whose `nextRunAt` is due or empty, and runs them in order.
- A newly created enabled agent has `nextRunAt` set to its creation time, so it is **due immediately** and runs on the next 15-minute tick.
- After each run, the next run time is set to now plus `24 hours / runs per day`. The interval is anchored to the moment the run is claimed, not to the clock, so a slow run does not push the next slot back.

| Runs per day | Interval |
| --- | --- |
| 1 | daily |
| 2 | every 12h |
| 3 | every 8h |
| 4 | every 6h |
| 6 | every 4h |
| 8 | every 3h |
| 12 | every 2h |
| 24 | hourly |
| 48 | every 30m |
| 96 | every 15m (the tick rate, so effectively "every tick") |

The cron ticks every 15 minutes and picks up an agent at the **first tick after its interval has passed**, so the real cadence is the interval rounded up to a 15 minute boundary. Editing an agent recomputes its next run from that moment.

- Within one tick, roles run in this order: **planner, scrapper, writer, qc, reviewer**. A topic must exist before anything can research it, the writer needs verified research before it can draft, and QC gates a draft before a reviewer approves it. The order only matters inside a single tick; the real throughput comes from each agent's own cadence.
- The endpoint has a 240 second budget with a 30 second safety margin, so each agent gets about 210 seconds. Each run also gets its own deadline, so a slow model call is cancelled cleanly and the run is recorded as failed instead of being killed mid-run. If many agents are due at once, it processes as many as fit and reports how many were left.
- A scrapper run advances the research as far as its budget allows. A topic can rest in **Fetched** for one or more ticks, then becomes **Researched** on a later run once its notes are written. This is normal, not a stall.
- Any run still marked as running after 20 minutes is closed automatically as failed, and the topic it had claimed is released back to the queue. This is what keeps the Activity page honest after a hard interruption.
- On a tick with no agents due, one published post that has no cover gets a generated cover, so a fresh article picks up an image without you clicking anything. Set aside a way to see it: the response includes `coversGenerated`.

When you save an agent, its next run time is recomputed, so editing an agent resets its schedule from that moment.

## Run an agent manually

On the Agents page, each card has a **Run agent** button. It runs the agent immediately, regardless of its schedule.

- On success, a toast shows the run summary, for example `Drafted "Best standing desks"` or `Passed QC on "..."`.
- On failure, a toast shows the error.
- The card and the run history refresh afterwards.

This button is the fastest way to test a prompt without waiting for the schedule.

## Run and publish

The Agents page also has a **Run & publish** button. It runs the enabled agents in role order (planner, scrapper, writer, qc, reviewer) and publishes any draft that passes the verified research gate, without waiting for the next 15 minute tick.

- It runs in the background and the request returns immediately. Watch progress on the Activity page, which shows the live board.
- It never publishes a draft whose topic has no verified research. Those stay in review for a human.
- One pass can stop partway because research is split into phases. Press it again, or let the schedule finish the topic.
- A second click while a pass is running is refused, so runs cannot stack. The button shows **Running** until the pass ends.

## Test the cron locally

Never test the schedule against production. The cron Worker is the same code in both places, so a local run tells you everything a production run would, without publishing anything real.

1. Start the dev server (`astro dev --background`). It reads `.dev.vars`, so the `AGENT_CRON_TOKEN` in that file is the one it checks.
2. Make the agents due immediately, **local database only**:
   ```sh
   npx wrangler d1 execute light-content --local --command "UPDATE agents SET next_run_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE enabled = 1"
   ```
3. Call the endpoint the cron Worker calls:
   ```sh
   TOKEN=$(grep '^AGENT_CRON_TOKEN=' .dev.vars | cut -d= -f2-)
   curl -s -X POST http://localhost:4321/api/agents/run-due -H "Authorization: Bearer $TOKEN"
   ```
   The response reports `published`, `reaped`, `coversGenerated`, `processed`, and how many agents were `remaining`.
4. To exercise the cron Worker itself, including its schedule and the manual `POST /run` handler, use Wrangler's test scheduler:
   ```sh
   npx wrangler dev --config workers/agents/wrangler.jsonc --test-scheduled
   curl "http://localhost:8787/__scheduled?cron=*/1+*+*+*+*"
   ```
   While testing, a one minute `crons` value (`["*/1 * * * *"]`) saves you waiting; put back `["*/15 * * * *"]` before deploying.

Local timings exist only to make testing fast. Production keeps the real cadence.

## See the pipeline flow

The top of the **Agents** page shows the pipeline as a compact timeline of six
stages: planner, researcher, writer, qc, reviewer, published. One line per stage,
each with how much work is waiting there, how much is in progress, and how much
it finished today, together with the agents that own it and their cadence. A
connector animates only while the upstream stage has work to move, so a still
graph means the pipeline is idle rather than broken. Users who ask for reduced
motion get a static graph.

QC and the reviewer both pull from the same pending drafts, which is why those
two stages show the same waiting count.

## Where to see history

- **Scorecard**: the Agents page shows a table per agent over a selectable window (7, 30, or 90 days): runs, success rate, tokens in and out, articles, topics proposed, tokens per article, drafts reviewed, approvals, and revisions requested. Use it to decide which agent deserves its schedule.
- **Edit page run history**: open an agent's edit page to see its last 10 runs, each with the start time, status (Running, Succeeded, Failed), token usage, the summary, and any error.
- **Activity page**: every run also writes an activity entry (`agent.planner`, `agent.writer`, `agent.reviewer`, `agent.qc`, `agent.scrapper`) under the agent's name. The page filters by scope, actor, action, target, text, and date range, and each agent entry links to the run detail, where the full output is visible and a failed run can be retried.

## Where to see research

The **Research** page (`/dashboard/research`), in the sidebar under Automation, is where the scrapper's output is reviewed:

- **Topics**: every topic with its research status and its note counts, split into verified, unverified, and coverage gaps.
- **Notes**: every research note across topics, with filters by text, kind, and angle and a verified-only toggle.
- **Runs**: the recent scrapper runs, each with its raw output viewable.
- **Budget**: current usage, with searches today and this month and the estimated cost.

Notes stay editable per topic from the **Topics** page, and the Research page links into that same research notes dialog. The scrapper runs on its schedule, for example every hour at 24 runs per day, and works one phase at a time; a topic that is not finished stays in **Fetched** until a later run.

## Troubleshooting

- **No DeepSeek key**: runs fail with `DEEPSEEK_KEY_MISSING`, "Add your DeepSeek API key before running an agent." Save a key on the Agents page.
- **Invalid key**: saving a bad key fails validation with `DEEPSEEK_UNAUTHORIZED`, "The DeepSeek API key was rejected." A key can also be rejected at run time if it was revoked. Replace it.
- **Out of balance**: `DEEPSEEK_INSUFFICIENT_BALANCE`, "The DeepSeek account has no balance." Top up the DeepSeek account.
- **Rate limit (429)**: `DEEPSEEK_RATE_LIMITED`, "DeepSeek rate limit reached." Wait and run again, or lower the runs per day.
- **Timeout**: `DEEPSEEK_TIMEOUT`, "The DeepSeek request timed out." The request has a 180 second limit. Try again or simplify the prompt.
- **Unreachable**: `DEEPSEEK_UNREACHABLE`, "Could not reach the DeepSeek API." Likely a temporary network problem.
- **Agent limit reached**: `AGENT_LIMIT_REACHED`, either "You can create at most 12 agents." or a message naming the role limit (planner 2, scrapper 2, writer 4, qc 2, reviewer 2). Delete an agent before creating another, or change the role of the one you have.
- **Nothing to do**: a reviewer or QC run with no pending draft returns "No pending draft to review". That is a success, not an error.
- **Skipped**: a scrapper run with no search provider configured is recorded as **Skipped**, and the topic is left alone. It makes no model call, so a skipped run costs nothing. Connect a provider on the Agents page.
- **Search rejected the key**: `SEARCH_UNAUTHORIZED`. Replace the provider key on the Agents page.
- **Search rate limited**: `SEARCH_RATE_LIMITED`. The scrapper retries a few times with backoff, then blocks the topic. Wait and run again, or lower the runs per day.
- **No usable sources**: the scrapper found nothing or could not read any page, so it blocks the topic with the reason in the topic note. Check the topic keywords or add a source URL by hand.
- **Invalid model output**: `MODEL_OUTPUT_INVALID` means the model did not return usable JSON. Run the agent again.

## Not built yet

- There is no automatic run-level retry. A failed run is recorded, and you can retry it from its Activity run detail, or wait for the next scheduled tick.
- There is no per agent spending cap yet. The Spending budget is global, so the token limit is shared by every agent.
- There is no per-day history chart. The scorecard is a table over 7, 30, or 90 days, and the Spending budget card and the Research page show today's and this month's usage with an estimated cost.
- There is no mandatory fact-check stage before the editorial review. A draft is reviewed by whichever reviewer claims it first, so the strict reviewer raises the bar on the drafts it takes rather than gating every draft. A `review_stage` column would make that mandatory.
- There is no search volume data behind the planner. Topics come from the seed keywords in the prompt plus the model, not from measured search volume.
- Only Tavily and the development fixture provider are wired up. Brave, Serper, and Exa can be added behind the same interface.
