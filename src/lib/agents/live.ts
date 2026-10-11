import { staleRunCutoff } from './reaper';
import { listAgents } from './store';
import { countTopics } from './topics';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RECENT_LIMIT = 15;

export interface LiveRun {
  runId: string;
  agentId: string;
  agentName: string;
  role: string;
  startedAt: string;
  minutesRunning: number;
}

export interface LiveRecentRun {
  runId: string;
  agentId: string;
  agentName: string;
  role: string;
  status: 'succeeded' | 'failed' | 'skipped';
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
  tokensOut: number | null;
}

export interface LivePipeline {
  topicsQueued: number;
  topicsFetched: number;
  topicsResearched: number;
  topicsInProgress: number;
  pendingReview: number;
  changesRequested: number;
}

export interface LiveNextRun {
  agentId: string;
  agentName: string;
  role: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export interface AgentLiveSnapshot {
  generatedAt: string;
  running: LiveRun[];
  recent: LiveRecentRun[];
  pipeline: LivePipeline;
  publishedToday: number;
  publishedLastHour: number;
  nextRuns: LiveNextRun[];
}

interface RunningRow {
  id: string;
  agent_id: string;
  started_at: string;
}

interface RecentRow {
  id: string;
  agent_id: string;
  status: string;
  summary: string | null;
  tokens_out: number | null;
  started_at: string;
  finished_at: string | null;
}

interface ReviewRow {
  review_status: string | null;
  total: number;
}

function readRunStatus(value: string): 'succeeded' | 'failed' | 'skipped' {
  if (value === 'failed' || value === 'skipped') {
    return value;
  }

  return 'succeeded';
}

function elapsedMinutes(now: number, startedAt: string): number {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - started) / MINUTE_MS));
}

async function loadPipeline(db: D1Database): Promise<LivePipeline> {
  const [counts, reviewRows] = await Promise.all([
    countTopics(db),
    db
      .prepare(
        "SELECT review_status, COUNT(*) AS total FROM posts WHERE status = 'draft' GROUP BY review_status",
      )
      .all<ReviewRow>(),
  ]);

  let pendingReview = 0;
  let changesRequested = 0;

  for (const row of reviewRows.results ?? []) {
    if (row.review_status === 'changes_requested') {
      changesRequested += row.total;
    } else if (row.review_status === 'pending' || row.review_status === null) {
      pendingReview += row.total;
    }
  }

  return {
    topicsQueued: counts.queued,
    topicsFetched: counts.fetched,
    topicsResearched: counts.researched,
    topicsInProgress: counts.inProgress,
    pendingReview,
    changesRequested,
  };
}

async function countPublished(db: D1Database, sinceIso: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM posts
       WHERE status = 'published' AND COALESCE(updated_date, updated_at) >= ?`,
    )
    .bind(sinceIso)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function loadAgentLiveSnapshot(db: D1Database): Promise<AgentLiveSnapshot> {
  const now = Date.now();
  const [agents, runningRows, recentRows, pipeline, publishedToday, publishedLastHour] =
    await Promise.all([
      listAgents(db),
      db
        .prepare(
          "SELECT id, agent_id, started_at FROM agent_runs WHERE status = 'running' AND started_at >= ? ORDER BY started_at DESC",
        )
        .bind(staleRunCutoff(now))
        .all<RunningRow>(),
      db
        .prepare(
          `SELECT id, agent_id, status, summary, tokens_out, started_at, finished_at
           FROM agent_runs ORDER BY started_at DESC LIMIT ?`,
        )
        .bind(RECENT_LIMIT)
        .all<RecentRow>(),
      loadPipeline(db),
      countPublished(db, new Date(now - DAY_MS).toISOString()),
      countPublished(db, new Date(now - HOUR_MS).toISOString()),
    ]);

  const byAgentId = new Map(agents.map((agent) => [agent.id, agent]));
  const nameOf = (agentId: string): string => byAgentId.get(agentId)?.name ?? agentId;
  const roleOf = (agentId: string): string => byAgentId.get(agentId)?.role ?? 'unknown';

  const running: LiveRun[] = (runningRows.results ?? []).map((row) => ({
    runId: row.id,
    agentId: row.agent_id,
    agentName: nameOf(row.agent_id),
    role: roleOf(row.agent_id),
    startedAt: row.started_at,
    minutesRunning: elapsedMinutes(now, row.started_at),
  }));

  const recent: LiveRecentRun[] = (recentRows.results ?? []).map((row) => ({
    runId: row.id,
    agentId: row.agent_id,
    agentName: nameOf(row.agent_id),
    role: roleOf(row.agent_id),
    status: readRunStatus(row.status),
    summary: row.summary,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    tokensOut: row.tokens_out,
  }));

  const nextRuns: LiveNextRun[] = agents.map((agent) => ({
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    enabled: agent.enabled,
    nextRunAt: agent.nextRunAt,
  }));

  return {
    generatedAt: new Date(now).toISOString(),
    running,
    recent,
    pipeline,
    publishedToday,
    publishedLastHour,
    nextRuns,
  };
}
