import { publishDuePosts } from '../scheduling/store';
import { reapStaleRuns } from './reaper';
import { AGENT_ROLE_ORDER, sortAgentsByRoleOrder } from './roles';
import { runAgent } from './runner';
import { listDueAgents } from './store';
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

async function loadWorkload(db: D1Database): Promise<number> {
  const [topics, drafts] = await Promise.all([
    countTopics(db),
    db
      .prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'draft'")
      .first<{ total: number }>(),
  ]);

  return topics.queued + topics.fetched + (drafts?.total ?? 0);
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
    const agents = sortAgentsByRoleOrder(await listDueAgents(db, new Date().toISOString()));

    for (const role of AGENT_ROLE_ORDER) {
      for (const agent of agents.filter((entry) => entry.role === role)) {
        const remaining = deadline - Date.now();
        if (remaining < MIN_RUN_MS) {
          break;
        }

        const result = await runAgent(db, agent, {
          signal: AbortSignal.timeout(remaining),
          deadline,
        });
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
