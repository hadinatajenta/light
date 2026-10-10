import { runAgent } from '@/lib/agents/runner';
import { getAgent } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const POST = withAdmin(async ({ params }, requestId) => {
  const database = await requireContentDatabase();
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The agent id is required.');
  }

  const agent = await getAgent(database, id);
  const result = await runAgent(database, agent);

  return jsonOk({ result }, requestId);
});
