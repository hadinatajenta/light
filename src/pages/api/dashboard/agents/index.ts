import { recordActivity, toUserActor } from '@/lib/activity/record';
import {
  AGENT_MODELS,
  AGENT_ROLE_DEFINITIONS,
  DEFAULT_AGENT_MODEL,
  MAX_AGENTS,
  MAX_RUNS_PER_DAY,
  MIN_RUNS_PER_DAY,
} from '@/lib/agents/roles';
import { agentInputSchema } from '@/lib/agents/schema';
import { describeSearchConfig } from '@/lib/agents/search/settings';
import { describeDeepseekKey } from '@/lib/agents/settings';
import { createAgent, listAgents } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const [agents, deepseek, search] = await Promise.all([
    listAgents(database),
    describeDeepseekKey(database),
    describeSearchConfig(database),
  ]);

  return jsonOk(
    {
      agents,
      meta: {
        roles: Object.values(AGENT_ROLE_DEFINITIONS),
        models: [...AGENT_MODELS],
        maxAgents: MAX_AGENTS,
        minRunsPerDay: MIN_RUNS_PER_DAY,
        maxRunsPerDay: MAX_RUNS_PER_DAY,
        defaultModel: DEFAULT_AGENT_MODEL,
        deepseek,
        search,
      },
    },
    requestId,
  );
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = agentInputSchema.parse(await readJsonBody(request, 20_000));
  const agent = await createAgent(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'agent.created',
    targetType: 'agent',
    targetId: agent.id,
    summary: `Created agent "${agent.name}"`,
  });

  return jsonOk({ agent }, requestId, 201);
});
