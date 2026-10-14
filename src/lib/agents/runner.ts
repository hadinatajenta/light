import { recordActivity } from '../activity/record';
import { ApiError } from '../errors';
import {
  buildAnalystFindingsReadyNotification,
  buildAnalystSourcesDegradedNotification,
} from '../notifications/analyst';
import { describeModelProviderFailure } from '../notifications/model-provider-failure';
import { notify } from '../notifications/notify';
import { readLastPublishedAt } from '../scheduling/store';
import { listOpenPlannerFindings, markFindingActioned } from './analyst/findings';
import { type AnalystRunReport, runPerformanceAnalyst } from './analyst/runner';
import { MODEL_TAIL_BRANCHES, resolveAgentRunBranch } from './branches';
import { readBudgetState, recordModelUsage } from './budget';
import { rankCatalogForTopic } from './catalog';
import { formatDemandBrief, loadDemandBrief } from './demand';
import { stripWriterEnvelope } from './envelope';
import { type ChatMessage, createChatCompletion, extractJsonObject } from './model-client';
import { type PlannerFindingRef, type PlannerTopic, parsePlannerTopics } from './planner';
import { formatPreflightIssues, runPreflight } from './preflight';
import { nextPublishSlot, readQuotaSettings } from './quota';
import { runScrapperResearch } from './research';
import {
  claimPendingDraft,
  createDraftPost,
  type DraftTarget,
  listRecentPublishedPosts,
  listRecentPublishedTitles,
  releaseClaimedDraft,
  schedulePostPublish,
  setPostReview,
  setPostStage,
  updateDraftBody,
} from './review';
import { resolveReviewClaimStage, reviewStageAfterPass } from './review-stages';
import {
  claimRevisionTarget,
  findRevisionTarget,
  parkExhaustedRevisions,
  type RevisionTarget,
  replaceDraftBody,
  saveReviewNotes,
} from './revision';
import { getRoleDefinition } from './roles';
import { resolveSearchProvider } from './search/registry';
import { readSearchConfig } from './search/settings';
import { requireProviderKey } from './settings';
import { hasVerifiedSources, listVerifiedSources, renderSourcesForPrompt } from './sources';
import {
  type AgentRecord,
  claimAgentRun,
  createAgentRun,
  finishAgentRun,
  hasRepeatedFailures,
  listAgents,
  markAgentRun,
  mergeWriterCategories,
  parseAgentCategories,
} from './store';
import { findTopicMatchIssues, type TopicMatchReference } from './topic-match';
import {
  blockTopic,
  claimTopicForScrapper,
  claimTopicForWriter,
  countTopics,
  createTopic,
  findTopicByPost,
  isTopicQueueFull,
  listTopics,
  markTopicFetched,
  markTopicResearched,
  markTopicUsed,
  recordTopicFailure,
  releaseTopic,
  scrapperResumeStatus,
  type TopicRecord,
} from './topics';

export interface RunAgentResult {
  runId: string;
  status: 'succeeded' | 'failed' | 'skipped';
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
  topicBlocked?: boolean;
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
const SCRAPPER_RESEARCH_BUDGET_MS = 180_000;
const MAX_PLANNER_FINDINGS = 10;
const MIN_CHAINED_REVIEW_MS = 20_000;
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

async function loadPlannerCategories(db: D1Database): Promise<string[]> {
  const writers = await db
    .prepare("SELECT categories FROM agents WHERE role = 'writer' AND enabled = 1")
    .all<{ categories: string | null }>();
  const writerCategories = mergeWriterCategories(
    (writers.results ?? []).map((row) => parseAgentCategories(row.categories)),
  );

  if (writerCategories.length > 0) {
    return writerCategories;
  }

  const posts = await db
    .prepare(
      `SELECT DISTINCT category FROM posts
       WHERE status = 'published' AND category IS NOT NULL AND TRIM(category) <> ''`,
    )
    .all<{ category: string }>();

  return [...new Set((posts.results ?? []).map((row) => row.category.trim()))];
}

function formatPlannerFindings(findings: readonly PlannerFindingRef[]): string {
  if (findings.length === 0) {
    return '';
  }

  const lines = findings
    .map((finding) => `- ${finding.id} | score ${finding.score} | ${finding.title}`)
    .join('\n');

  return `\n\nOpen performance findings that a new article could answer, highest score first:\n${lines}\n\nWhen a topic addresses one of these findings, include "sourceFindingId" with that finding id. Omit the field for topics that address none.`;
}

function buildPlannerMessage(
  categories: readonly string[],
  topicTitles: readonly string[],
  publishedTitles: readonly string[],
  findings: readonly PlannerFindingRef[],
  demandBrief: string | null,
): string {
  const categoryList = categories.length > 0 ? categories.join(', ') : 'general';
  const queued =
    topicTitles.length > 0
      ? `\n\nQueued topics already waiting, do not duplicate:\n- ${topicTitles.join('\n- ')}`
      : '';
  const published =
    publishedTitles.length > 0
      ? `\n\nArticles already published, do not duplicate:\n- ${publishedTitles.join('\n- ')}`
      : '';
  const findingsBlock = formatPlannerFindings(findings);
  const demand = demandBrief ? `\n\n${demandBrief}` : '';

  return `Allowed categories, choose exactly one per topic: ${categoryList}.${queued}${published}${findingsBlock}${demand}

Return a single JSON object with key "topics": an array of 5 to 8 objects, each with keys title (string, 10 to 70 characters), category (string, from the allowed list), intent ("informational", "commercial", "transactional", or "navigational"), keywords (array of 2 to 5 lowercase long-tail search phrases), and rationale (string, one sentence).`;
}

function summarizePlannedTopics(topics: readonly PlannerTopic[]): string {
  const categories = [...new Set(topics.map((topic) => topic.category))];
  const label = topics.length === 1 ? 'topic' : 'topics';

  return categories.length > 0
    ? `Proposed ${topics.length} ${label} for ${categories.join(', ')}`
    : `Proposed ${topics.length} ${label}`;
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

  const selected = rankCatalogForTopic(usable, topic, MAX_CATALOG_ITEMS);

  return selected.map((row) => `- ${row.slug} | ${row.name}`).join('\n');
}

async function buildUserMessage(
  db: D1Database,
  agent: AgentRecord,
  topic: TopicRecord | null,
  revisionTarget: RevisionTarget | null,
  draft: DraftTarget | null,
): Promise<string> {
  if (agent.role === 'writer') {
    if (revisionTarget) {
      const notes = revisionTarget.reviewNotes || 'No specific notes were recorded.';
      const draft = `Title: ${revisionTarget.title}\n\nDescription: ${revisionTarget.description}\n\n${truncate(revisionTarget.body, MAX_DRAFT_CHARS)}`;

      return `An editor reviewed this draft and asked for changes.

Editor notes:
${notes}

Current draft:
${draft}

Revise the article so every point in the notes is addressed, and keep the parts that already work. Do not introduce facts that are not supported. Return JSON with keys: title (string), description (string, 50 to 160 characters), tags (array of 2 to 4 lowercase slugs), body (markdown string, no H1), editorNotes (string).`;
    }

    if (!topic) {
      return '';
    }

    const [catalog, sources, published] = await Promise.all([
      loadCatalogSlice(db, topic),
      listVerifiedSources(db, topic.id),
      listRecentPublishedPosts(db, 12),
    ]);

    const research = renderSourcesForPrompt(sources);
    const researchBlock = research
      ? `\n\nResearch notes gathered for this topic. Stay within them and do not go beyond what they support:\n${research}`
      : '\n\nNo research notes were gathered for this topic. If the article cannot be written accurately without specific facts, return NEEDS RESEARCH instead of writing it.';

    const publishedLines = published.map((post) => `- ${post.title} (/blog/${post.id}/)`);
    const avoid =
      publishedLines.length > 0
        ? `\n\nAlready published, do not duplicate. Use these exact paths for internal links:\n${publishedLines.join('\n')}`
        : '';
    const keywords = topic.keywords.length > 0 ? `\nKeywords: ${topic.keywords.join(', ')}` : '';
    const category = topic.category ? `\nCategory: ${topic.category}` : '';

    return `Topic: ${topic.title}${category}${keywords}${researchBlock}

Available products (use only these slugs, linked as [text](product:slug)):
${catalog}

Return JSON with keys: title (string, 10 to 70 characters), description (string, 50 to 160 characters), tags (array of 2 to 4 lowercase slugs), body (markdown string, no H1), editorNotes (string).${avoid}`;
  }

  if (!draft) {
    return '';
  }

  const renderedDraft = `Title: ${draft.title}\n\nDescription: ${draft.description}\n\n${truncate(draft.body, MAX_DRAFT_CHARS)}`;

  const topicForDraft = await findTopicByPost(db, draft.id);
  const sources = topicForDraft ? await listVerifiedSources(db, topicForDraft.id) : [];
  const research = renderSourcesForPrompt(sources);

  if (agent.role === 'reviewer') {
    const topicBlock = topicForDraft
      ? `\n\nThis draft was written for the topic "${topicForDraft.title}". Topic keywords: ${topicForDraft.keywords.join(', ') || 'none'}.\n\nVerified research for that topic:\n${research || 'No verified research note is linked to this topic yet.'}`
      : '\n\nNo topic is linked to this draft.';

    return `Return JSON with keys: decision ("approve" or "changes_requested"), notes (string), revisedBody (string, the full revised markdown, or an empty string when approving).\n\nRefuse with changes_requested when the article is not about the topic above, and name that mismatch in your notes. Keep any rewrite on that topic and use only the research above.\n\nDraft:\n${renderedDraft}${topicBlock}`;
  }

  const researchBlock = research
    ? `\n\nResearch notes the draft was supposed to be based on:\n${research}`
    : '\n\nNo research notes are linked to this draft.';

  return `Return JSON with keys: passed (boolean), issues (array of strings).\n\nDraft:\n${renderedDraft}${researchBlock}`;
}

async function applyResult(
  db: D1Database,
  agent: AgentRecord,
  content: string,
  topic: TopicRecord | null,
  revisionTarget: RevisionTarget | null,
  draft: DraftTarget | null,
): Promise<AppliedResult> {
  if (agent.role === 'writer') {
    const parsed = extractJsonObject(content);
    const title = readString(parsed.title);
    const description = readString(parsed.description);
    const body = stripWriterEnvelope(readString(parsed.body));
    const tags = readStringArray(parsed.tags, 6);
    const editorNotes = readString(parsed.editorNotes);

    if (!title || !body) {
      throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The writer did not return a usable draft.');
    }

    if (topic) {
      const mismatches = findTopicMatchIssues(
        { title, body },
        { title: topic.title, keywords: topic.keywords },
      );

      if (mismatches.length > 0) {
        const reason = [
          'The writer returned an article that is not about the topic it claimed.',
          ...mismatches.map((mismatch) => `- ${mismatch.message}`),
        ].join('\n');

        await blockTopic(db, topic.id, reason);

        return {
          summary: `Blocked "${topic.title}": the draft is about a different topic`,
          output: truncate(`${reason}\n\n${content}`, MAX_OUTPUT_CHARS),
          topicBlocked: true,
        };
      }
    }

    if (revisionTarget) {
      await replaceDraftBody(db, revisionTarget.id, { title, description, body });

      return {
        summary: `Revised "${title}"`,
        output: truncate(editorNotes ? `${editorNotes}\n\n${content}` : content, MAX_OUTPUT_CHARS),
        postId: revisionTarget.id,
      };
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

  const target = draft;
  if (!target) {
    return { summary: 'No pending draft to process', output: '' };
  }

  if (agent.role === 'reviewer') {
    const parsed = extractJsonObject(content);
    const decision = parsed.decision === 'approve' ? 'approve' : 'changes_requested';
    const notes = readString(parsed.notes);
    const revisedBody = stripWriterEnvelope(readString(parsed.revisedBody));
    const claimStage = resolveReviewClaimStage(agent.role, agent.autoPublish) ?? 'fact_check';

    if (decision === 'approve') {
      const linkedTopic = await findTopicByPost(db, target.id);
      const topicReference: TopicMatchReference = linkedTopic
        ? { title: linkedTopic.title, keywords: linkedTopic.keywords }
        : { title: target.title, keywords: [] };

      const preflightIssues = runPreflight(
        {
          title: target.title,
          description: target.description,
          body: revisedBody || target.body,
        },
        topicReference,
      );

      if (preflightIssues.length > 0) {
        const blockedNotes = [
          notes,
          `Deterministic preflight found:\n${formatPreflightIssues(preflightIssues)}`,
        ]
          .filter(Boolean)
          .join('\n\n');

        await saveReviewNotes(db, target.id, blockedNotes);
        await setPostReview(db, target.id, 'changes_requested', agent.id);

        return {
          summary: `Blocked "${target.title}": preflight found ${preflightIssues.length} issue(s)`,
          output: truncate(blockedNotes, MAX_OUTPUT_CHARS),
        };
      }

      if (revisedBody) {
        await updateDraftBody(db, target.id, { body: revisedBody });
      }

      if (claimStage === 'fact_check') {
        const canPublish = linkedTopic ? await hasVerifiedSources(db, linkedTopic.id) : true;
        const [quotaSettings, lastPublishedAt] = await Promise.all([
          readQuotaSettings(db),
          readLastPublishedAt(db),
        ]);
        const minGapMs = quotaSettings.minGapMinutes * 60_000;
        const lastPublished = lastPublishedAt ? new Date(lastPublishedAt) : null;
        const slot = nextPublishSlot(lastPublished, minGapMs, new Date());

        await setPostReview(db, target.id, 'approved', agent.id);
        await setPostStage(db, target.id, reviewStageAfterPass('fact_check'));
        await schedulePostPublish(db, target.id, slot.toISOString());

        if (!canPublish) {
          return {
            summary: `Approved "${target.title}" but its topic has no verified research, so it is left for a human: add verified research notes or publish it by hand`,
            output: truncate(notes, MAX_OUTPUT_CHARS),
          };
        }

        return {
          summary: `Approved "${target.title}" for the publisher at ${slot.toISOString()}`,
          output: truncate(notes, MAX_OUTPUT_CHARS),
        };
      }

      await setPostStage(db, target.id, reviewStageAfterPass('editorial'));
      await releaseClaimedDraft(db, target.id);

      return {
        summary: `Cleared the editorial pass on "${target.title}"`,
        output: truncate(notes, MAX_OUTPUT_CHARS),
      };
    }

    await updateDraftBody(db, target.id, revisedBody ? { body: revisedBody } : {});
    await saveReviewNotes(db, target.id, notes);
    await setPostReview(db, target.id, 'changes_requested', agent.id);

    return {
      summary: `Requested changes on "${target.title}"`,
      output: truncate(notes, MAX_OUTPUT_CHARS),
    };
  }

  const parsed = extractJsonObject(content);
  const modelIssues = readStringArray(parsed.issues, 20);
  const preflightIssues = runPreflight({
    title: target.title,
    description: target.description,
    body: target.body,
  });
  const mergedIssues = [
    ...modelIssues,
    ...preflightIssues.map((issue) => `${issue.code}: ${issue.message}`),
  ];

  if (mergedIssues.length > 0) {
    await saveReviewNotes(db, target.id, mergedIssues.map((issue) => `- ${issue}`).join('\n'));
    await setPostReview(db, target.id, 'changes_requested', agent.id);

    return {
      summary: `Blocked "${target.title}": ${mergedIssues.length} issue(s)`,
      output: truncate(content, MAX_OUTPUT_CHARS),
    };
  }

  await setPostStage(db, target.id, reviewStageAfterPass('qc'));
  await releaseClaimedDraft(db, target.id);

  return {
    summary: `Passed QC on "${target.title}"`,
    output: truncate(content, MAX_OUTPUT_CHARS),
  };
}

async function recordAgentActivity(
  agent: AgentRecord,
  runId: string,
  summary: string,
): Promise<void> {
  await recordActivity({
    actorId: agent.id,
    actorType: 'agent',
    actorLabel: agent.name,
    action: `agent.${agent.role}`,
    targetType: 'agent',
    targetId: agent.id,
    summary,
    runId,
  });
}

function releasedStatusFor(agent: AgentRecord): 'queued' | 'researched' {
  return agent.role === 'writer' ? 'researched' : 'queued';
}

interface AgentRunStatusRow {
  status: string;
}

export async function maybeRecordFailureAlert(
  db: D1Database,
  agent: AgentRecord,
  runId: string,
): Promise<void> {
  const result = await db
    .prepare('SELECT status FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 3')
    .bind(agent.id)
    .all<AgentRunStatusRow>();

  if (!hasRepeatedFailures((result.results ?? []).map((row) => row.status))) {
    return;
  }

  await recordActivity({
    actorId: agent.id,
    actorType: 'agent',
    actorLabel: agent.name,
    action: 'agent.alert',
    targetType: 'agent',
    targetId: agent.id,
    summary: `Agent "${agent.name}" failed 3 runs in a row`,
    runId,
    metadata: { consecutiveFailures: 3 },
  });

  await notify({
    event: 'agent.alert',
    title: `Agent "${agent.name}" failed 3 runs in a row`,
    body: 'The agent needs attention. Review the recent runs for the failure cause.',
    link: '/dashboard/activity',
    actorLabel: agent.name,
    runId,
    dedupeSubject: agent.id,
    metadata: { consecutiveFailures: 3, role: agent.role },
  });
}

async function notifyAnalystReport(runId: string, report: AnalystRunReport): Promise<void> {
  const notifications = [
    buildAnalystFindingsReadyNotification({
      runId,
      window: report.window,
      persisted: report.persisted,
    }),
    buildAnalystSourcesDegradedNotification({ statuses: report.statuses }),
  ];

  for (const notification of notifications) {
    if (notification) {
      await notify(notification);
    }
  }
}

async function recordRunFailureNotification(
  agent: AgentRecord,
  runId: string,
  error: unknown,
  message: string,
): Promise<void> {
  const code = error instanceof ApiError ? error.code : null;
  const hint = code ? describeModelProviderFailure(code) : null;

  if (code && hint) {
    await notify({
      event: 'deepseek.unavailable',
      title: `DeepSeek failure: ${code}`,
      body: `${hint}\nAgent: ${agent.name}\nDetails: ${message}`,
      link: '/dashboard/agents',
      actorLabel: agent.name,
      runId,
      dedupeSubject: code,
      metadata: { role: agent.role, code },
    });
    return;
  }

  await notify({
    event: 'agent.run.failed',
    title: `Agent "${agent.name}" run failed`,
    body: message,
    link: '/dashboard/activity',
    actorLabel: agent.name,
    runId,
    dedupeSubject: `${agent.id}:${code ?? 'unmapped'}`,
    metadata: { role: agent.role, code },
  });
}

export interface RunAgentOptions {
  signal?: AbortSignal;
  deadline?: number;
  force?: boolean;
}

export interface ChainReviewDecisionInput {
  role: string;
  status: RunAgentResult['status'];
  producedDraft: boolean;
  signalAborted: boolean;
  deadline: number | undefined;
  now: number;
}

export function shouldChainReviewRun(input: ChainReviewDecisionInput): boolean {
  if (input.role !== 'writer' || input.status !== 'succeeded' || !input.producedDraft) {
    return false;
  }

  if (input.signalAborted) {
    return false;
  }

  return input.deadline === undefined || input.deadline - input.now >= MIN_CHAINED_REVIEW_MS;
}

interface AgentRunExecution {
  result: RunAgentResult;
  producedDraft: boolean;
}

export async function runAgent(
  db: D1Database,
  agent: AgentRecord,
  options: RunAgentOptions = {},
): Promise<RunAgentResult> {
  const execution = await executeAgentRun(db, agent, options);
  const { result } = execution;

  if (result.status === 'succeeded' && agent.role !== 'analyst') {
    await notify({
      event: 'agent.run.succeeded',
      title: `Agent "${agent.name}" finished a run`,
      body: result.summary,
      link: '/dashboard/activity',
      actorLabel: agent.name,
      runId: result.runId,
      metadata: { role: agent.role, tokensIn: result.tokensIn, tokensOut: result.tokensOut },
    });
  }

  await chainReviewRun(db, agent, execution, options);

  return result;
}

async function chainReviewRun(
  db: D1Database,
  agent: AgentRecord,
  execution: AgentRunExecution,
  options: RunAgentOptions,
): Promise<void> {
  const decision = shouldChainReviewRun({
    role: agent.role,
    status: execution.result.status,
    producedDraft: execution.producedDraft,
    signalAborted: options.signal?.aborted ?? false,
    deadline: options.deadline,
    now: Date.now(),
  });

  if (!decision) {
    return;
  }

  const reviewer = await findChainedReviewer(db);

  if (!reviewer) {
    return;
  }

  try {
    await runAgent(db, reviewer, {
      signal: options.signal,
      deadline: options.deadline,
      force: true,
    });
  } catch (error) {
    console.error('The chained reviewer run failed', error);
  }
}

async function findChainedReviewer(db: D1Database): Promise<AgentRecord | null> {
  const reviewers = (await listAgents(db)).filter(
    (candidate) => candidate.enabled && candidate.role === 'reviewer',
  );

  return reviewers.find((candidate) => candidate.autoPublish) ?? reviewers[0] ?? null;
}

async function executeAgentRun(
  db: D1Database,
  agent: AgentRecord,
  options: RunAgentOptions = {},
): Promise<AgentRunExecution> {
  const { signal, deadline } = options;

  if (!(await claimAgentRun(db, agent, { force: options.force }))) {
    return {
      result: {
        runId: '',
        status: 'skipped',
        summary: 'Agent is not due or a run is already in progress',
        output: '',
        tokensIn: 0,
        tokensOut: 0,
      },
      producedDraft: false,
    };
  }

  const runId = await createAgentRun(db, agent.id);
  const effectiveDeadline = deadline ?? Date.now() + SCRAPPER_RESEARCH_BUDGET_MS;

  let topic: TopicRecord | null = null;
  let revisionTarget: RevisionTarget | null = null;
  let draft: DraftTarget | null = null;

  try {
    const branch = resolveAgentRunBranch(agent.role);
    const role = getRoleDefinition(agent.role);

    if (branch === 'analyst') {
      const report = await runPerformanceAnalyst(db, {
        agentId: agent.id,
        runId,
        signal: options.signal,
      });

      await finishAgentRun(db, runId, {
        status: 'succeeded',
        summary: report.summary,
        output: truncate(report.output, MAX_OUTPUT_CHARS),
      });
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, report.summary);
      await notifyAnalystReport(runId, report);

      return {
        result: {
          runId,
          status: 'succeeded',
          summary: report.summary,
          output: truncate(report.output, MAX_OUTPUT_CHARS),
          tokensIn: 0,
          tokensOut: 0,
        },
        producedDraft: false,
      };
    }

    const budget = await readBudgetState(db);
    if (budget.paused || budget.tokensExhausted) {
      const summary = budget.paused ? 'Budget is paused' : 'Daily token budget reached';
      await finishAgentRun(db, runId, { status: 'skipped', summary });
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, summary);
      return {
        result: { runId, status: 'skipped', summary, output: '', tokensIn: 0, tokensOut: 0 },
        producedDraft: false,
      };
    }

    const apiKey = await requireProviderKey(db, agent.provider);

    if (agent.role !== 'analyst') {
      await notify({
        event: 'agent.run.started',
        title: `Agent "${agent.name}" started a run`,
        body: `Role: ${agent.role}. Model: ${agent.model}.`,
        link: '/dashboard/activity',
        actorLabel: agent.name,
        runId,
        metadata: { role: agent.role, model: agent.model },
      });
    }

    if (branch === 'planner') {
      const [categories, topicCounts] = await Promise.all([
        loadPlannerCategories(db),
        countTopics(db),
      ]);

      if (categories.length === 0 || isTopicQueueFull(topicCounts)) {
        throw new ApiError(
          409,
          'PLANNER_QUEUE_FULL',
          'The topic queue already holds enough unclaimed work.',
        );
      }

      const [existingTopics, publishedTitles, plannerFindings, search] = await Promise.all([
        listTopics(db, { limit: 200 }),
        listRecentPublishedTitles(db, 200),
        listOpenPlannerFindings(db, MAX_PLANNER_FINDINGS),
        resolveSearchProvider(db),
      ]);
      const existingTitles = existingTopics.map((entry) => entry.title);
      const knownTitles = [...existingTitles, ...publishedTitles];
      const findingRefs: PlannerFindingRef[] = plannerFindings.map((finding) => ({
        id: finding.id,
        title: finding.title,
        detail: finding.detail,
        score: finding.score,
        actionType: finding.actionType,
      }));
      const demandBrief = formatDemandBrief(await loadDemandBrief({ db, search, signal }));
      const userMessage = buildPlannerMessage(
        categories,
        existingTitles,
        publishedTitles,
        findingRefs,
        demandBrief,
      );

      const response = await createChatCompletion({
        provider: agent.provider,
        apiKey,
        model: agent.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(agent) },
          { role: 'user', content: userMessage },
        ],
        effort: role.defaultEffort,
        userId: agent.id,
        jsonMode: true,
        maxTokens: 32_000,
        signal,
      });

      await recordModelUsage(db, response.tokensIn, response.tokensOut);

      const parsed = extractJsonObject(response.content);
      const planned = parsePlannerTopics(
        parsed,
        categories,
        knownTitles,
        findingRefs.map((finding) => finding.id),
      ).topics;

      for (const entry of planned) {
        const createdTopic = await createTopic(
          db,
          {
            title: entry.title,
            keywords: entry.keywords,
            category: entry.category,
            intent: entry.intent,
          },
          agent.id,
        );

        if (entry.sourceFindingId) {
          await markFindingActioned(db, entry.sourceFindingId, createdTopic.id, agent.id);
        }
      }

      const summary = summarizePlannedTopics(planned);
      await finishAgentRun(db, runId, {
        status: 'succeeded',
        summary,
        output: truncate(response.content, MAX_OUTPUT_CHARS),
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      });
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, summary);

      return {
        result: {
          runId,
          status: 'succeeded',
          summary,
          output: truncate(response.content, MAX_OUTPUT_CHARS),
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
        },
        producedDraft: false,
      };
    }

    if (branch === 'writer') {
      await parkExhaustedRevisions(db);
      topic = await claimTopicForWriter(db, agent.id, agent.categories);

      if (!topic) {
        const candidate = await findRevisionTarget(db);

        if (candidate && (await claimRevisionTarget(db, candidate.id))) {
          revisionTarget = candidate;
        }
      }

      if (!topic && !revisionTarget) {
        throw new ApiError(
          409,
          'NO_RESEARCHED_TOPIC',
          'No researched topic is available. Run the Researcher to collect material first.',
        );
      }
    }

    if (branch === 'scrapper') {
      topic = await claimTopicForScrapper(db, agent.id);

      if (!topic) {
        throw new ApiError(
          409,
          'NO_QUEUED_TOPIC',
          'No queued topic is available. Run the Planner to propose topics first.',
        );
      }

      const [search, searchConfig] = await Promise.all([
        resolveSearchProvider(db),
        readSearchConfig(db),
      ]);

      const outcome = await runScrapperResearch({
        db,
        agent,
        topic,
        apiKey,
        search,
        allowUnverified: searchConfig.allowUnverified,
        deadline: effectiveDeadline,
        signal,
      });

      if (outcome.status === 'skipped' || outcome.status === 'deferred') {
        await releaseTopic(db, topic.id, outcome.summary, await scrapperResumeStatus(db, topic.id));
        await finishAgentRun(db, runId, { status: 'skipped', summary: outcome.summary });
        await markAgentRun(db, agent);
        await recordAgentActivity(agent, runId, outcome.summary);
        return {
          result: {
            runId,
            status: 'skipped',
            summary: outcome.summary,
            output: '',
            tokensIn: 0,
            tokensOut: 0,
          },
          producedDraft: false,
        };
      }

      if (outcome.status === 'blocked') {
        await blockTopic(db, topic.id, outcome.summary);
      } else if (outcome.status === 'completed') {
        await markTopicResearched(db, topic.id);
      } else {
        await markTopicFetched(db, topic.id);
      }

      await finishAgentRun(db, runId, {
        status: 'succeeded',
        summary: outcome.summary,
        output: outcome.output,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
      });
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, outcome.summary);

      return {
        result: {
          runId,
          status: 'succeeded',
          summary: outcome.summary,
          output: outcome.output,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
        },
        producedDraft: false,
      };
    }

    if (branch === 'review') {
      const claimStage = resolveReviewClaimStage(agent.role, agent.autoPublish);
      draft = claimStage ? await claimPendingDraft(db, agent.id, claimStage) : null;

      if (!draft) {
        throw new ApiError(
          409,
          'NO_PENDING_DRAFT',
          'No draft is waiting for review. Run a Writer to produce one.',
        );
      }
    }

    if (!MODEL_TAIL_BRANCHES.includes(branch)) {
      throw new ApiError(
        500,
        'UNKNOWN_AGENT_ROLE',
        `Agent role "${agent.role}" reached the model tail without a run branch.`,
      );
    }

    const userMessage = await buildUserMessage(db, agent, topic, revisionTarget, draft);

    if (!userMessage) {
      if (topic) {
        await releaseTopic(db, topic.id, 'No pending draft to process', releasedStatusFor(agent));
      }
      const summary = 'No pending draft to process';
      await finishAgentRun(db, runId, { status: 'succeeded', summary });
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, summary);
      return {
        result: { runId, status: 'succeeded', summary, output: '', tokensIn: 0, tokensOut: 0 },
        producedDraft: false,
      };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(agent) },
      { role: 'user', content: userMessage },
    ];

    const response = await createChatCompletion({
      provider: agent.provider,
      apiKey,
      model: agent.model,
      messages,
      effort: role.defaultEffort,
      userId: agent.id,
      jsonMode: true,
      maxTokens: 32_000,
      signal,
    });

    await recordModelUsage(db, response.tokensIn, response.tokensOut);

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
      await markAgentRun(db, agent);
      await recordAgentActivity(agent, runId, summary);

      return {
        result: {
          runId,
          status: 'succeeded',
          summary,
          output: needsResearch,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
        },
        producedDraft: false,
      };
    }

    const applied = await applyResult(db, agent, response.content, topic, revisionTarget, draft);

    if (topic) {
      if (applied.postId) {
        await markTopicUsed(db, topic.id, applied.postId);
      } else if (!applied.topicBlocked) {
        await releaseTopic(db, topic.id, applied.summary, releasedStatusFor(agent));
      }
    }

    await finishAgentRun(db, runId, {
      status: 'succeeded',
      summary: applied.summary,
      output: applied.output,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
    });
    await markAgentRun(db, agent);
    await recordAgentActivity(agent, runId, applied.summary);

    return {
      result: {
        runId,
        status: 'succeeded',
        summary: applied.summary,
        output: applied.output,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      },
      producedDraft: agent.role === 'writer' && Boolean(applied.postId),
    };
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : 'The run failed.';
    const details =
      error instanceof ApiError && error.details && typeof error.details === 'object'
        ? (error.details as { snippet?: string; length?: number })
        : undefined;
    const message =
      details && typeof details.length === 'number'
        ? truncate(
            `${baseMessage} Received ${details.length} characters: ${details.snippet ?? ''}`,
            400,
          )
        : baseMessage;

    if (topic) {
      const releaseStatus =
        agent.role === 'scrapper'
          ? await scrapperResumeStatus(db, topic.id)
          : releasedStatusFor(agent);
      await recordTopicFailure(db, topic.id, message, releaseStatus);
    }

    if (revisionTarget) {
      await db
        .prepare(
          "UPDATE posts SET review_status = 'changes_requested', updated_at = ? WHERE id = ? AND review_status = 'pending'",
        )
        .bind(new Date().toISOString(), revisionTarget.id)
        .run();
    }

    if (draft) {
      await releaseClaimedDraft(db, draft.id);
    }

    await finishAgentRun(db, runId, {
      status: 'failed',
      summary: `Run failed: ${message}`,
      error: message,
    });
    await markAgentRun(db, agent);
    await recordAgentActivity(agent, runId, `Run failed: ${message}`);
    await maybeRecordFailureAlert(db, agent, runId);
    await recordRunFailureNotification(agent, runId, error, message);

    return {
      result: {
        runId,
        status: 'failed',
        summary: `Run failed: ${message}`,
        output: '',
        tokensIn: 0,
        tokensOut: 0,
        error: message,
      },
      producedDraft: false,
    };
  }
}
