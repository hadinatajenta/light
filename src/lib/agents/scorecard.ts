import { parseAgentCategories } from './store';

export const SCORECARD_ROLE_ORDER = ['planner', 'scrapper', 'writer', 'qc', 'reviewer'] as const;

const DEFAULT_SCORECARD_DAYS = 30;
const MIN_SCORECARD_DAYS = 1;
const MAX_SCORECARD_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgentScorecard {
  agentId: string;
  name: string;
  role: string;
  categories: string[];
  enabled: boolean;
  runsTotal: number;
  runsOk: number;
  runsFailed: number;
  successRate: number;
  tokensIn: number;
  tokensOut: number;
  topicsClaimed: number;
  topicsProposed: number;
  articlesUsed: number;
  postsReviewed: number;
  postsApproved: number;
  revisionsRequested: number;
  tokensPerArticle: number | null;
  lastRunAt: string | null;
}

export interface ScorecardAgent {
  id: string;
  name: string;
  role: string;
  categories: string[];
  enabled: boolean;
  lastRunAt: string | null;
}

export interface ScorecardRunRow {
  agentId: string;
  status: string;
  total: number;
  tokensIn: number;
  tokensOut: number;
}

export interface ScorecardTopicRow {
  agentId: string;
  claimed: number;
  used: number;
}

export interface ScorecardProposedRow {
  agentId: string;
  proposed: number;
}

export interface ScorecardPostRow {
  agentId: string;
  reviewed: number;
  approved: number;
  revisionsRequested: number;
}

export interface ScorecardRows {
  runs: ScorecardRunRow[];
  topics: ScorecardTopicRow[];
  proposed: ScorecardProposedRow[];
  posts: ScorecardPostRow[];
}

export interface LoadAgentScorecardOptions {
  days?: number;
}

interface AgentScorecardRow {
  id: string;
  name: string;
  role: string;
  categories: string | null;
  enabled: number;
  last_run_at: string | null;
}

interface RunAggregateRow {
  agent_id: string;
  status: string;
  total: number;
  tokens_in: number | null;
  tokens_out: number | null;
}

interface TopicAggregateRow {
  agent_id: string;
  claimed: number;
  used: number;
}

interface ProposedAggregateRow {
  agent_id: string;
  proposed: number;
}

interface PostAggregateRow {
  agent_id: string;
  reviewed: number;
  approved: number;
  revisions_requested: number;
}

export function clampScorecardDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SCORECARD_DAYS;
  }

  return Math.min(Math.max(Math.floor(value), MIN_SCORECARD_DAYS), MAX_SCORECARD_DAYS);
}

export function successRate(runsOk: number, runsTotal: number): number {
  if (runsTotal <= 0) {
    return 0;
  }

  return runsOk / runsTotal;
}

export function tokensPerArticle(tokens: number, articles: number): number | null {
  if (articles <= 0) {
    return null;
  }

  return tokens / articles;
}

function rankForRole(role: string): number {
  const rank = (SCORECARD_ROLE_ORDER as readonly string[]).indexOf(role);

  return rank === -1 ? SCORECARD_ROLE_ORDER.length : rank;
}

export function buildScorecard(agent: ScorecardAgent, rows: ScorecardRows): AgentScorecard {
  let runsTotal = 0;
  let runsOk = 0;
  let runsFailed = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const run of rows.runs) {
    if (run.agentId !== agent.id) {
      continue;
    }

    runsTotal += run.total;
    tokensIn += run.tokensIn;
    tokensOut += run.tokensOut;

    if (run.status === 'succeeded') {
      runsOk += run.total;
    } else if (run.status === 'failed') {
      runsFailed += run.total;
    }
  }

  let topicsClaimed = 0;
  let articlesUsed = 0;

  for (const topic of rows.topics) {
    if (topic.agentId !== agent.id) {
      continue;
    }

    topicsClaimed += topic.claimed;
    articlesUsed += topic.used;
  }

  let topicsProposed = 0;

  for (const proposed of rows.proposed) {
    if (proposed.agentId === agent.id) {
      topicsProposed += proposed.proposed;
    }
  }

  let postsReviewed = 0;
  let postsApproved = 0;
  let revisionsRequested = 0;

  for (const post of rows.posts) {
    if (post.agentId !== agent.id) {
      continue;
    }

    postsReviewed += post.reviewed;
    postsApproved += post.approved;
    revisionsRequested += post.revisionsRequested;
  }

  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    categories: agent.categories,
    enabled: agent.enabled,
    runsTotal,
    runsOk,
    runsFailed,
    successRate: successRate(runsOk, runsTotal),
    tokensIn,
    tokensOut,
    topicsClaimed,
    topicsProposed,
    articlesUsed,
    postsReviewed,
    postsApproved,
    revisionsRequested,
    tokensPerArticle: tokensPerArticle(tokensIn + tokensOut, articlesUsed),
    lastRunAt: agent.lastRunAt,
  };
}

async function loadAgentRows(db: D1Database): Promise<AgentScorecardRow[]> {
  const result = await db
    .prepare('SELECT id, name, role, categories, enabled, last_run_at FROM agents')
    .all<AgentScorecardRow>();

  return result.results ?? [];
}

async function loadRunAggregates(db: D1Database, cutoff: string): Promise<ScorecardRunRow[]> {
  const result = await db
    .prepare(
      `SELECT agent_id, status, COUNT(*) AS total,
         COALESCE(SUM(tokens_in), 0) AS tokens_in,
         COALESCE(SUM(tokens_out), 0) AS tokens_out
       FROM agent_runs WHERE started_at >= ? GROUP BY agent_id, status`,
    )
    .bind(cutoff)
    .all<RunAggregateRow>();

  return (result.results ?? []).map((row) => ({
    agentId: row.agent_id,
    status: row.status,
    total: row.total,
    tokensIn: row.tokens_in ?? 0,
    tokensOut: row.tokens_out ?? 0,
  }));
}

async function loadTopicAggregates(db: D1Database): Promise<ScorecardTopicRow[]> {
  const result = await db
    .prepare(
      `SELECT assigned_agent_id AS agent_id, COUNT(*) AS claimed,
         SUM(CASE WHEN used_post_id IS NOT NULL THEN 1 ELSE 0 END) AS used
       FROM topics WHERE assigned_agent_id IS NOT NULL GROUP BY assigned_agent_id`,
    )
    .all<TopicAggregateRow>();

  return (result.results ?? []).map((row) => ({
    agentId: row.agent_id,
    claimed: row.claimed,
    used: row.used,
  }));
}

async function loadProposedAggregates(db: D1Database): Promise<ScorecardProposedRow[]> {
  const result = await db
    .prepare(
      `SELECT created_by_agent_id AS agent_id, COUNT(*) AS proposed
       FROM topics WHERE created_by_agent_id IS NOT NULL GROUP BY created_by_agent_id`,
    )
    .all<ProposedAggregateRow>();

  return (result.results ?? []).map((row) => ({
    agentId: row.agent_id,
    proposed: row.proposed,
  }));
}

async function loadPostAggregates(db: D1Database): Promise<ScorecardPostRow[]> {
  const result = await db
    .prepare(
      `SELECT reviewed_by AS agent_id, COUNT(*) AS reviewed,
         SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN review_status = 'changes_requested' THEN 1 ELSE 0 END) AS revisions_requested
       FROM posts WHERE reviewed_by IS NOT NULL GROUP BY reviewed_by`,
    )
    .all<PostAggregateRow>();

  return (result.results ?? []).map((row) => ({
    agentId: row.agent_id,
    reviewed: row.reviewed,
    approved: row.approved,
    revisionsRequested: row.revisions_requested,
  }));
}

export async function loadAgentScorecard(
  db: D1Database,
  options: LoadAgentScorecardOptions = {},
): Promise<AgentScorecard[]> {
  const days = clampScorecardDays(options.days ?? DEFAULT_SCORECARD_DAYS);
  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();

  const [agentRows, runs, topics, proposed, posts] = await Promise.all([
    loadAgentRows(db),
    loadRunAggregates(db, cutoff),
    loadTopicAggregates(db),
    loadProposedAggregates(db),
    loadPostAggregates(db),
  ]);

  const rows: ScorecardRows = { runs, topics, proposed, posts };

  const scorecards = agentRows.map((row) =>
    buildScorecard(
      {
        id: row.id,
        name: row.name,
        role: row.role,
        categories: parseAgentCategories(row.categories),
        enabled: row.enabled === 1,
        lastRunAt: row.last_run_at,
      },
      rows,
    ),
  );

  scorecards.sort((left, right) => {
    const rankDelta = rankForRole(left.role) - rankForRole(right.role);

    return rankDelta === 0 ? left.name.localeCompare(right.name) : rankDelta;
  });

  return scorecards;
}
