import { publishDuePosts } from '../scheduling/store';
import { readBudgetState } from './budget';
import { type QuotaWorkload, selectCatchUpRoles } from './quota';
import { reapStaleRuns } from './reaper';
import { AGENT_ROLE_ORDER, sortAgentsByRoleOrder } from './roles';
import { withRunDeadline } from './run-deadline';
import { type RunAgentResult, runAgent } from './runner';
import { type AgentRecord, listAgents } from './store';
import { countTopics } from './topics';

const MIN_RUN_MS = 15_000;
const MIN_ROUND_MS = 20_000;

export interface PipelineRunSummary {
  agentId: string;
  role: string;
  status: string;
  summary: string;
}

export interface PipelineResult {
  rounds: number;
  reaped: number;
  published: string[];
  runs: PipelineRunSummary[];
}

export function abandonedRunResult(): RunAgentResult {
  return {
    runId: '',
    status: 'skipped',
    summary: 'Run exceeded its deadline and was abandoned',
    output: '',
    tokensIn: 0,
    tokensOut: 0,
  };
}

async function runAgentSafely(
  db: D1Database,
  agent: AgentRecord,
  deadline: number,
): Promise<RunAgentResult> {
  const remaining = deadline - Date.now();

  return withRunDeadline(
    runAgent(db, agent, {
      signal: AbortSignal.timeout(remaining),
      deadline,
      force: true,
    }),
    remaining,
    abandonedRunResult(),
  );
}

async function loadWorkload(db: D1Database): Promise<number> {
  const [topics, drafts] = await Promise.all([
    countTopics(db),
    db
      .prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'draft'")
      .first<{ total: number }>(),
  ]);

  return topics.queued + topics.fetched + (drafts?.total ?? 0);
}

async function loadQuotaWorkload(db: D1Database): Promise<QuotaWorkload> {
  const [topics, draftRows, budget] = await Promise.all([
    countTopics(db),
    db
      .prepare(
        "SELECT review_status, COUNT(*) AS total FROM posts WHERE status = 'draft' GROUP BY review_status",
      )
      .all<{ review_status: string | null; total: number }>(),
    readBudgetState(db),
  ]);

  let pendingDrafts = 0;
  let revisionDrafts = 0;

  for (const row of draftRows.results ?? []) {
    if (row.review_status === 'changes_requested') {
      revisionDrafts += row.total;
    } else if (row.review_status === null || row.review_status === 'pending') {
      pendingDrafts += row.total;
    }
  }

  return {
    openTopics: topics.queued + topics.fetched,
    researchedTopics: topics.researched,
    pendingDrafts,
    revisionDrafts,
    searchesRemaining: budget.searchesRemaining,
  };
}

export async function runPipeline(
  db: D1Database,
  options: { budgetMs: number; roundLimit?: number },
): Promise<PipelineResult> {
  const deadline = Date.now() + options.budgetMs;
  const roundLimit = Math.max(options.roundLimit ?? 4, 1);
  const reaped = await reapStaleRuns(db);
  const published = (await publishDuePosts(db)).published;
  const runs: PipelineRunSummary[] = [];
  let previousWorkload = await loadWorkload(db);
  let rounds = 0;

  while (rounds < roundLimit && Date.now() < deadline - MIN_ROUND_MS) {
    rounds += 1;
    const enabled = (await listAgents(db)).filter((agent) => agent.enabled);
    const agents = sortAgentsByRoleOrder(enabled);

    for (const role of AGENT_ROLE_ORDER) {
      for (const agent of agents.filter((entry) => entry.role === role)) {
        if (deadline - Date.now() < MIN_RUN_MS) {
          break;
        }

        const result = await runAgentSafely(db, agent, deadline);
        runs.push({ agentId: agent.id, role, status: result.status, summary: result.summary });
      }
    }

    published.push(...(await publishDuePosts(db)).published);

    const workload = await loadWorkload(db);
    if (workload >= previousWorkload) {
      break;
    }
    previousWorkload = workload;
  }

  return { rounds, reaped, published, runs };
}

export async function runQuotaCatchUp(
  db: D1Database,
  options: { deadline: number; maxRuns: number },
): Promise<PipelineRunSummary[]> {
  const workload = await loadQuotaWorkload(db);
  const roles = selectCatchUpRoles(workload);

  if (roles.length === 0) {
    return [];
  }

  const enabled = (await listAgents(db)).filter((agent) => agent.enabled);
  const ordered = sortAgentsByRoleOrder(enabled.filter((agent) => roles.includes(agent.role)));
  const runs: PipelineRunSummary[] = [];

  for (const agent of ordered) {
    if (runs.length >= options.maxRuns || options.deadline - Date.now() < MIN_RUN_MS) {
      break;
    }

    const result = await runAgentSafely(db, agent, options.deadline);
    runs.push({
      agentId: agent.id,
      role: agent.role,
      status: result.status,
      summary: result.summary,
    });
  }

  return runs;
}
