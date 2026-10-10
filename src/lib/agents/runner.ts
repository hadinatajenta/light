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
import { type AgentRecord, createAgentRun, finishAgentRun, markAgentRun } from './store';

export interface RunAgentResult {
  runId: string;
  status: 'succeeded' | 'failed';
  summary: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

const MAX_OUTPUT_CHARS = 200_000;
const MAX_DRAFT_CHARS = 40_000;

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

function buildSystemPrompt(agent: AgentRecord): string {
  const role = getRoleDefinition(agent.role);
  return `${role.defaultPrompt}${agent.prompt}\n\nRespond with a single JSON object and nothing else.`;
}

async function buildUserMessage(db: D1Database, agent: AgentRecord): Promise<string> {
  if (agent.role === 'writer') {
    const titles = await listRecentPublishedTitles(db, 12);
    const avoid =
      titles.length > 0 ? `\n\nAlready published, do not duplicate:\n- ${titles.join('\n- ')}` : '';

    return `Write the guide now. Return JSON with keys: title (string), description (string, 50 to 160 characters), tags (array of 2 to 4 lowercase slugs), body (markdown string).${avoid}`;
  }

  if (agent.role === 'scrapper') {
    return 'Return JSON with keys: notes (array of objects with keys heading and detail).';
  }

  const target = await findPendingDraft(db);
  if (!target) {
    return '';
  }

  const draft = `Title: ${target.title}\n\nDescription: ${target.description}\n\n${truncate(target.body, MAX_DRAFT_CHARS)}`;

  if (agent.role === 'reviewer') {
    return `Return JSON with keys: decision ("approve" or "changes_requested"), notes (string), revisedBody (string, the full revised markdown, or an empty string when approving).\n\nDraft:\n${draft}`;
  }

  return `Return JSON with keys: passed (boolean), issues (array of strings).\n\nDraft:\n${draft}`;
}

async function applyResult(
  db: D1Database,
  agent: AgentRecord,
  content: string,
): Promise<{ summary: string; output: string }> {
  if (agent.role === 'scrapper') {
    const parsed = extractJsonObject(content);
    const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    return {
      summary: `Collected ${notes.length} research note(s)`,
      output: truncate(content, MAX_OUTPUT_CHARS),
    };
  }

  if (agent.role === 'writer') {
    const parsed = extractJsonObject(content);
    const title = readString(parsed.title);
    const description = readString(parsed.description);
    const body = readString(parsed.body);
    const tags = readStringArray(parsed.tags, 6);

    if (!title || !body) {
      throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The writer did not return a usable draft.');
    }

    await createDraftPost(db, agent, { title, description, tags, body });
    return { summary: `Drafted "${title}"`, output: truncate(content, MAX_OUTPUT_CHARS) };
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

  try {
    const apiKey = await requireDeepseekKey(db);
    const role = getRoleDefinition(agent.role);
    const userMessage = await buildUserMessage(db, agent);

    if (!userMessage) {
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

    const applied = await applyResult(db, agent, response.content);

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
