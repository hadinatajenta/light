import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { loadAnalystDashboard } from '@/lib/dashboard/analyst';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const state = await loadAnalystDashboard(database);

  if (!state.agent) {
    throw new ApiError(
      404,
      'ANALYST_NOT_PROVISIONED',
      'The Performance Analyst has not been created yet. The next scheduled agent run creates it.',
    );
  }

  return jsonOk(state, requestId);
});
