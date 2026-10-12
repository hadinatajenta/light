import { loadAgentFlow } from '@/lib/agents/flow';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const flow = await loadAgentFlow(database);

  return jsonOk(flow, requestId);
});
