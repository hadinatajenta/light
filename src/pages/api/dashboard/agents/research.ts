import { loadResearchOverview } from '@/lib/agents/research-overview';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  return jsonOk(await loadResearchOverview(database), requestId);
});
