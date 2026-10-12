# Agent roster and the planner

Decision recorded 2026-10-12. This documents the target roster, the prompt for the
strict reviewer, and the exact database changes, so the roster can be applied
consistently after the code ships.

## Why

Production data before this change: 46 published posts, an empty topic queue, 5
agents (3 writers, 1 reviewer, 1 scrapper), 211 runs in 3 days with 7 failures,
about 4,073 tokens per writer run and about 2.4 writer runs per published
article. Capacity was not the constraint: with no queued topics every extra
writer idles, and a single reviewer is the serial gate. So supply and
specialisation come first, volume second.

## Target roster

Applied to production on 2026-10-12.

| Agent | Role | Beat | Runs/day | Auto publish |
| --- | --- | --- | --- | --- |
| Planner | planner | (any) | 4 | no |
| Researcher | scrapper | (any) | 24 | no |
| Writer A | writer | desk-setup, monitors, accessories | 24 | no |
| Writer B | writer | chairs, buying-basics, keyboards, audio | 24 | no |
| QC | qc | (any) | 24 | no |
| Reviewer | reviewer | (any) | 24 | yes |
| Reviewer Strict | reviewer | (any) | 24 | yes |

Applied ids: `agent-planner`, `agent-qc`, `agent-reviewer-strict`, with
`agent-writer-a` and `agent-writer-b` carrying the beats above.

`Writer C` was deleted by the owner. `MAX_AGENTS` becomes 12 with a per role cap
(writer 4, reviewer 2, qc 2, scrapper 2, planner 2), so the roster cannot grow
into eight competing writers by accident. The planner runs four times a day,
which yields roughly 20 to 32 topics a day, comfortably above what two writers,
one scrapper, and two reviewers can actually carry.

## Writer beats

The first attempt gave each writer one category. With two writers that left five
of the seven categories with no writer, so the planner refused to queue them and
those topics were never written. A writer now owns a **beat**: a set of
categories it claims from.

| Writer | Beat | Why this grouping |
| --- | --- | --- |
| Writer A | desk-setup, monitors, accessories | The desk surface and what sits on it: desk sizes and heights, standing desks, monitor arms and display height, cable management, organisers, and the small accessories |
| Writer B | chairs, buying-basics, keyboards, audio | Sitting and interacting: seating and posture, mats and footrests, keyboards and mice, desk audio, and the buying basics that teach a reader to judge a specification |

Every category now has an owner, and the planner proposes for the union of the
enabled writers' beats, which is all seven. An empty beat still means any
category, so a new writer with no ticks yet is not idle. Change a beat at any
time from the agent form, where each category is a checkbox.

Category choice: `desk-setup` (14 published articles) and `chairs` (3) are the
two large purchases a home-office buyer makes, and both have enough depth for
buying guides. `monitors`, `keyboards`, and `audio` stay uncovered for now; the
planner only proposes topics in the categories the enabled writers cover, so
nothing is queued that no writer can claim. Add a writer per category when the
queue in the covered categories is consistently empty.

## How the planner feeds the queue

Role order is `planner, scrapper, writer, qc, reviewer`, so one tick can plan,
research, draft, gate, and review. Each planner run asks the model for 5 to 8
long-tail topics in the covered categories, grounded in the seed keywords in its
agent focus line, deduplicated against existing topics and published titles, and
written into the queue with a category, an intent, and 2 to 5 keyword phrases.
A run is capped at 8 topics. There is no search volume data yet; volume needs a
paid provider, and the topic fields are ready for it.

## Strict reviewer prompt

Stored on the `Reviewer Strict` agent. The ordinary reviewer still fixes and
approves; this one blocks unless every claim is supported.

```
IMPORTANT: These instructions replace the default reviewer guidance above. You do not fix and approve. Your job is the claim-by-claim check below, and your bias is toward blocking.

You are the strict fact guardian for Light Scripts, an independent publication covering home-office equipment, workspace ergonomics, and practical buying advice. A draft only passes you when every factual claim is supported, and you are the last check before it can be published.

Your bias is toward blocking, not approving. When the evidence is thin, request changes. You exist because the ordinary editorial reviewer is allowed to fix and approve; you are not.

CHECK EVERY CLAIM
- For each factual statement (a number, a specification, a standard, a material property, a compatibility statement, a durability or safety claim), find the support in the research notes supplied with the draft. If a claim has no support in the notes, it does not pass, even when it sounds plausible or widely known.
- Never accept a claim because it is common knowledge, because a competitor site says it, or because the draft is fluent. Support must be in the notes.
- Never accept a fabricated source, a source you are not certain exists, or a bare URL. The body must not contain a raw URL.
- A manufacturer's marketing claim must be labelled as a claim, not presented as an independent finding.
- If the notes are missing, or the draft needs facts the notes do not contain, request changes and name exactly which facts and sources are required.

STRUCTURE AND FORM
- Title 10 to 70 characters, description 50 to 160 characters, body without an H1, at least four meaningful H2 sections, and a final H2 titled "Sources and further reading".
- Numbers that belong together belong in a compact markdown table with two to five columns and at least two comparable rows, with a one-sentence lead-in and no restated table in prose.
- Remove sentences that only sound wise. Every recommendation carries a reason a reader could check.
- Affiliate links use only [descriptive text](product:slug) with a slug from the supplied list, next to the recommendation it supports. No raw URLs, no prices, no tracking parameters.
- No placeholder text, no "insert", no todo, no lorem ipsum.

DECISION RULE
- Request changes when anything above fails, when a claim is unsupported, when the draft needs a fact or a decision you cannot supply, or when the research notes are insufficient. Requesting changes is the expected outcome for a weak draft.
- Approve only when every claim is supported by the notes, the structure is complete, and you would defend the article in public.
- When you request changes, list every problem, most important first, naming the specific sentence or claim, so the writer can act on it.
- When you approve, still return the full, complete revisedBody, because that is what gets published. Never return an empty revisedBody on approval.
- Never rewrite the article into your own voice. Fix the factual, structural, and policy problems and keep the writer's structure and analysis.

Review focus:
```

## Two reviewers and the draft claim

Two reviewers run in parallel, so the reviewer and the QC now claim a draft
atomically before the model call (`review_status = 'in_review'`), and the claim
is released on failure or by the reaper after 20 minutes. Without that claim,
both reviewers would review the same draft and their decisions would race.

A consequence worth knowing: an approval already leads to publication, because
the scheduled publisher publishes any draft whose `review_status` is `approved`
and whose publication date has passed. So the strict reviewer raises the bar on
the drafts it takes, but it is not a mandatory gate on every draft.

Follow-up if a mandatory gate is wanted: add a `review_stage` column
(`fact_check` then `editorial`) and have the publisher require the final stage.
That is a state machine change, not a config change, so it is deliberately not
part of this round.

## Database changes

Applied on 2026-10-12, after the code deploy, so the draft claim was live before
a second reviewer existed.

Order matters: migration, then code deploy, then this roster. Applying the
roster before the claim code is live would put two reviewers on the same draft.

```sql
UPDATE agents SET category = 'desk-setup' WHERE name = 'Writer A';
UPDATE agents SET category = 'chairs' WHERE name = 'Writer B';

INSERT INTO agents (id, name, role, prompt, model, runs_per_day, enabled,
  auto_publish, last_run_at, next_run_at, created_at, updated_at)
VALUES ('agent-reviewer-strict', 'Reviewer Strict', 'reviewer', '<prompt above>',
  'deepseek-flash', 24, 1, 1, NULL, NULL, datetime('now'), datetime('now'));
```

The strict prompt contains apostrophes, so it is applied from a file with the
quotes escaped rather than from an inline one liner.

The QC agent is also created by the operator, because the QC gate only runs when
an agent has the `qc` role.
