import { recordActivity, toUserActor } from '@/lib/activity/record';
import { agentInputSchema } from '@/lib/agents/schema';
import { deleteAgent, getAgent, listAgentRuns, updateAgent } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The agent id is required.');
  }

  return id;
}

export const GET = withAdmin(async ({ params }, requestId) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const agent = await getAgent(database, id);
  const runs = await listAgentRuns(database, id, 10);

  return jsonOk({ agent, runs }, requestId);
});

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = agentInputSchema.parse(await readJsonBody(request, 20_000));
  const agent = await updateAgent(database, id, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'agent.updated',
    targetType: 'agent',
    targetId: agent.id,
    summary: `Updated agent "${agent.name}"`,
  });

  return jsonOk({ agent }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  await deleteAgent(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'agent.deleted',
    targetType: 'agent',
    targetId: id,
    summary: `Deleted agent "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
