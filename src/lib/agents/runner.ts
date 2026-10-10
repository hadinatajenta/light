import { recordActivity } from '../activity/record';
import { ApiError } from '../errors';
import { type ChatMessage, createChatCompletion, extractJsonObject } from './deepseek';
import {
  createDraftPost,
  findPendingDraft,
  listRecentPublishedTitles,
  publishPost,
  setPostReview,
  updateDraftBody,
} from './review';
import { getRoleDefinition } from './roles';
import { requireDeepseekKey } from './settings';
import { createSource, listSources, renderSourcesForPrompt, SOURCE_KINDS } from './sources';
import { type AgentRecord, createAgentRun, finishAgentRun, markAgentRun } from './store';
import {
  blockTopic,
  claimTopicForScrapper,
  claimTopicForWriter,
  findTopicByPost,
  markTopicResearched,
  markTopicUsed,
  releaseTopic,
  type TopicRecord,
} from './topics';

export interface RunAgentResult {
  runId: string;
  status: 'succeeded' | 'failed';
  summary: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

interface AppliedResult {
  summary: string;
  output: string;
  postId?: string;
}

interface CatalogRow {
  slug: string;
  name: string;
  target: string;
  topics: string;
  tracking_id: string | null;
  link_template: string | null;
  status: string;
  network: string;
  disclosure: string;
}

const MAX_OUTPUT_CHARS = 200_000;
const MAX_DRAFT_CHARS = 40_000;
const MAX_CATALOG_ITEMS = 12;
const NEEDS_RESEARCH_PATTERN = /^\s*NEEDS RESEARCH/i;

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n\n[truncated]`;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, limit)
    : [];
}

function readJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function readNeedsResearch(content: string): string | null {
  const trimmed = content.trim();

  if (NEEDS_RESEARCH_PATTERN.test(trimmed)) {
    return truncate(trimmed, 500);
  }

  try {
    const parsed = extractJsonObject(trimmed);
    const title = readString(parsed.title);
    const body = readString(parsed.body);

    if (NEEDS_RESEARCH_PATTERN.test(title) || NEEDS_RESEARCH_PATTERN.test(body)) {
      return truncate([title, body].filter(Boolean).join('\n\n'), 500);
    }
  } catch {
    return null;
  }

  return null;
}

function buildSystemPrompt(agent: AgentRecord): string {
  const role = getRoleDefinition(agent.role);
  return `${role.defaultPrompt}\n\nAgent focus: ${agent.prompt}\n\nRespond with a single JSON object and nothing else.`;
}

async function loadCatalogSlice(db: D1Database, topic: TopicRecord): Promise<string> {
  const result = await db
    .prepare(
      `SELECT p.slug, p.name, p.target, p.topics,
              pr.tracking_id, pr.link_template, pr.status, pr.network, pr.disclosure
       FROM affiliate_products p
       JOIN affiliate_programs pr ON pr.id = p.program_id
       WHERE p.is_active = 1 AND pr.status = 'approved'
       ORDER BY p.name ASC`,
    )
    .all<CatalogRow>();

  const usable = (result.results ?? []).filter(
    (row) => row.tracking_id && row.link_template && row.target,
  );

  if (usable.length === 0) {
    return 'The product catalog is empty. Write the guide without product links and say nothing about missing links.';
  }

  const matching = topic.category
    ? usable.filter((row) => readJsonArray(row.topics).includes(topic.category ?? ''))
    : [];
  const selected = (matching.length > 0 ? matching : usable).slice(0, MAX_CATALOG_ITEMS);

  return selected.map((row) => `- ${row.slug} | ${row.name}`).join('\n');
}

async function buildUserMessage(
  db: D1Database,
  agent: AgentRecord,
  topic: TopicRecord | null,
): Promise<string> {
  if (agent.role === 'writer') {
    if (!topic) {
      return '';
    }

    const [catalog, sources, titles] = await Promise.all([
      loadCatalogSlice(db, topic),
      listSources(db, topic.id),
      listRecentPublishedTitles(db, 12),
    ]);

    const research = renderSourcesForPrompt(sources);
    const researchBlock = research
      ? `\n\nResearch notes gathered for this topic. Stay within them and do not go beyond what they support:\n${research}`
      : '\n\nNo research notes were gathered for this topic. If the article cannot be written accurately without specific facts, return NEEDS RESEARCH instead of writing it.';

    const avoid =
      titles.length > 0 ? `\n\nAlready published, do not duplicate:\n- ${titles.join('\n- ')}` : '';
    const keywords = topic.keywords.length > 0 ? `\nKeywords: ${topic.keywords.join(', ')}` : '';
    const category = topic.category ? `\nCategory: ${topic.category}` : '';

    return `Topic: ${topic.title}${category}${keywords}${researchBlock}

Available products (use only these slugs, linked as [text](product:slug)):
${catalog}

Return JSON with keys: title (string, 10 to 70 characters), description (string, 50 to 160 characters), tags (array of 2 to 4 lowercase slugs), body (markdown string, no H1), editorNotes (string).${avoid}`;
  }

  if (agent.role === 'scrapper') {
    if (!topic) {
      return '';
    }

    const keywords = topic.keywords.length > 0 ? `\nKeywords: ${topic.keywords.join(', ')}` : '';
    const category = topic.category ? `\nCategory: ${topic.category}` : '';

    return `Research the topic below for a buying guide. Gather what a buyer must verify before purchasing: the specifications that actually matter, the compatibility traps, the materials and durability signals, and the marketing claims that mislead. Cite a named standard or a manufacturer document when a claim depends on one. Never invent specifications, prices, ratings, or test results. If a fact cannot be established, leave it out rather than guessing.

Topic: ${topic.title}${category}${keywords}

Return JSON with keys: notes (array of objects with keys heading (string), detail (string), kind (one of note, spec, claim, source), reference (string or null)).`;
  }

  const target = await findPendingDraft(db);
  if (!target) {
    return '';
  }

  const draft = `Title: ${target.title}\n\nDescription: ${target.description}\n\n${truncate(target.body, MAX_DRAFT_CHARS)}`;

  if (agent.role === 'reviewer') {
    return `Return JSON with keys: decision ("approve" or "changes_requested"), notes (string), revisedBody (string, the full revised markdown, or an empty string when approving).\n\nDraft:\n${draft}`;
  }

  const topicForDraft = await findTopicByPost(db, target.id);
  const sources = topicForDraft ? await listSources(db, topicForDraft.id) : [];
  const research = renderSourcesForPrompt(sources);
  const researchBlock = research
    ? `\n\nResearch notes the draft was supposed to be based on:\n${research}`
    : '\n\nNo research notes are linked to this draft.';

  return `Return JSON with keys: passed (boolean), issues (array of strings).\n\nDraft:\n${draft}${researchBlock}`;
}

async function applyResult(
  db: D1Database,
  agent: AgentRecord,
  content: string,
  topic: TopicRecord | null,
): Promise<AppliedResult> {
  if (agent.role === 'scrapper') {
    const parsed = extractJsonObject(content);
    const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
    let saved = 0;

    for (const entry of rawNotes.slice(0, 24)) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const note = entry as Record<string, unknown>;
      const heading = readString(note.heading);
      const detail = readString(note.detail);

      if (!heading || !detail) {
        continue;
      }

      const kind = readString(note.kind);
      const reference = readString(note.reference);

      await createSource(db, {
        topicId: topic?.id ?? '',
        agentId: agent.id,
        kind: (SOURCE_KINDS as readonly string[]).includes(kind)
          ? (kind as (typeof SOURCE_KINDS)[number])
          : 'note',
        heading,
        detail,
        reference: reference || null,
      });
      saved += 1;
    }

    return {
      summary: `Collected ${saved} research note(s)`,
      output: truncate(content, MAX_OUTPUT_CHARS),
    };
  }

  if (agent.role === 'writer') {
    const parsed = extractJsonObject(content);
    const title = readString(parsed.title);
    const description = readString(parsed.description);
    const body = readString(parsed.body);
    const tags = readStringArray(parsed.tags, 6);
    const editorNotes = readString(parsed.editorNotes);

    if (!title || !body) {
      throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The writer did not return a usable draft.');
    }

    const postId = await createDraftPost(db, agent, {
      title,
      description,
      tags,
      body,
      category: topic?.category ?? null,
    });

    return {
      summary: `Drafted "${title}"`,
      output: truncate(editorNotes ? `${editorNotes}\n\n${content}` : content, MAX_OUTPUT_CHARS),
      postId,
    };
  }

  const target = await findPendingDraft(db);
  if (!target) {
    return { summary: 'No pending draft to process', output: '' };
  }

  if (agent.role === 'reviewer') {
    const parsed = extractJsonObject(content);
    const decision = parsed.decision === 'approve' ? 'approve' : 'changes_requested';
    const notes = readString(parsed.notes);
    const revisedBody = readString(parsed.revisedBody);

    if (decision === 'approve') {
      await setPostReview(db, target.id, 'approved', agent.id);

      if (agent.autoPublish) {
        await publishPost(db, target.id);
        return {
          summary: `Approved and published "${target.title}"`,
          output: truncate(notes, MAX_OUTPUT_CHARS),
        };
      }

      return { summary: `Approved "${target.title}"`, output: truncate(notes, MAX_OUTPUT_CHARS) };
    }

    await updateDraftBody(db, target.id, revisedBody ? { body: revisedBody } : {});
    await setPostReview(db, target.id, 'changes_requested', agent.id);

    return {
      summary: `Requested changes on "${target.title}"`,
      output: truncate(notes, MAX_OUTPUT_CHARS),
    };
  }

  const parsed = extractJsonObject(content);
  const issues = readStringArray(parsed.issues, 20);

  return {
    summary:
      issues.length > 0
        ? `Found ${issues.length} issue(s) in "${target.title}"`
        : `Passed QC on "${target.title}"`,
    output: truncate(content, MAX_OUTPUT_CHARS),
  };
}

async function recordAgentActivity(agent: AgentRecord, summary: string): Promise<void> {
  await recordActivity({
    actorId: agent.id,
    actorType: 'agent',
    actorLabel: agent.name,
    action: `agent.${agent.role}`,
    targetType: 'agent',
    targetId: agent.id,
    summary,
  });
}

export async function runAgent(
  db: D1Database,
  agent: AgentRecord,
  signal?: AbortSignal,
): Promise<RunAgentResult> {
  const runId = await createAgentRun(db, agent.id);
  let topic: TopicRecord | null = null;

  try {
    const apiKey = await requireDeepseekKey(db);
    const role = getRoleDefinition(agent.role);

    if (agent.role === 'writer') {
      topic = await claimTopicForWriter(db, agent.id);

      if (!topic) {
        const summary = 'No topic queued';
        await finishAgentRun(db, runId, { status: 'succeeded', summary });
        await markAgentRun(db, agent.id, agent.runsPerDay);
        await recordAgentActivity(agent, summary);
        return { runId, status: 'succeeded', summary, output: '', tokensIn: 0, tokensOut: 0 };
      }
    }

    if (agent.role === 'scrapper') {
      topic = await claimTopicForScrapper(db, agent.id);

      if (!topic) {
        const summary = 'No topic queued';
        await finishAgentRun(db, runId, { status: 'succeeded', summary });
        await markAgentRun(db, agent.id, agent.runsPerDay);
        await recordAgentActivity(agent, summary);
        return { runId, status: 'succeeded', summary, output: '', tokensIn: 0, tokensOut: 0 };
      }
    }

    const userMessage = await buildUserMessage(db, agent, topic);

    if (!userMessage) {
      if (topic) {
        await releaseTopic(db, topic.id, 'No pending draft to process');
      }
      const summary = 'No pending draft to process';
      await finishAgentRun(db, runId, { status: 'succeeded', summary });
      await markAgentRun(db, agent.id, agent.runsPerDay);
      await recordAgentActivity(agent, summary);
      return { runId, status: 'succeeded', summary, output: '', tokensIn: 0, tokensOut: 0 };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(agent) },
      { role: 'user', content: userMessage },
    ];

    const response = await createChatCompletion({
      apiKey,
      model: agent.model,
      messages,
      effort: role.defaultEffort,
      userId: agent.id,
      jsonMode: true,
      signal,
    });

    const needsResearch = readNeedsResearch(response.content);

    if (needsResearch) {
      if (topic) {
        await blockTopic(db, topic.id, needsResearch);
      }

      const summary = topic ? `Blocked topic "${topic.title}": needs research` : 'Needs research';
      await finishAgentRun(db, runId, {
        status: 'succeeded',
        summary,
        output: needsResearch,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      });
      await markAgentRun(db, agent.id, agent.runsPerDay);
      await recordAgentActivity(agent, summary);

      return {
        runId,
        status: 'succeeded',
        summary,
        output: needsResearch,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      };
    }

    const applied = await applyResult(db, agent, response.content, topic);

    if (topic) {
      if (agent.role === 'scrapper') {
        await markTopicResearched(db, topic.id);
      } else if (applied.postId) {
        await markTopicUsed(db, topic.id, applied.postId);
      } else {
        await releaseTopic(db, topic.id, applied.summary);
      }
    }

    await finishAgentRun(db, runId, {
      status: 'succeeded',
      summary: applied.summary,
      output: applied.output,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
    });
    await markAgentRun(db, agent.id, agent.runsPerDay);
    await recordAgentActivity(agent, applied.summary);

    return {
      runId,
      status: 'succeeded',
      summary: applied.summary,
      output: applied.output,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The run failed.';

    if (topic) {
      await releaseTopic(db, topic.id, message);
    }

    await finishAgentRun(db, runId, {
      status: 'failed',
      summary: `Run failed: ${message}`,
      error: message,
    });
    await markAgentRun(db, agent.id, agent.runsPerDay);
    await recordAgentActivity(agent, `Run failed: ${message}`);

    return {
      runId,
      status: 'failed',
      summary: `Run failed: ${message}`,
      output: '',
      tokensIn: 0,
      tokensOut: 0,
      error: message,
    };
  }
}
