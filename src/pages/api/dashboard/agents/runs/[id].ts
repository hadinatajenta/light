import { listActivity } from '@/lib/activity/store';
import { findAgent, getAgentRun } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async ({ params }, requestId) => {
  const database = await requireContentDatabase();
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The run id is required.');
  }

  const run = await getAgentRun(database, id);
  const [agent, activity] = await Promise.all([
    findAgent(database, run.agentId),
    listActivity(database, { runId: id }),
  ]);

  return jsonOk(
    {
      run,
      agent: agent ? { id: agent.id, name: agent.name, role: agent.role } : null,
      activity,
    },
    requestId,
  );
});
