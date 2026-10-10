import { listActors } from '@/lib/activity/store';
import { withAdmin } from '@/lib/api/handler';
import { resolveContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await resolveContentDatabase();
  if (!database) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The content database is unavailable.');
  }

  const actors = await listActors(database);

  return jsonOk({ actors }, requestId);
});
