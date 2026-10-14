import { loadStageDetail } from '@/lib/agents/flow';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async ({ request }, requestId) => {
  const stageId = new URL(request.url).searchParams.get('stage') ?? '';

  if (stageId === '') {
    throw new ApiError(422, 'INVALID_STAGE', 'A stage id is required.');
  }

  const database = await requireContentDatabase();
  const detail = await loadStageDetail(database, stageId);

  if (!detail) {
    throw new ApiError(422, 'INVALID_STAGE', `Unknown pipeline stage "${stageId}".`);
  }

  return jsonOk(detail, requestId);
});
