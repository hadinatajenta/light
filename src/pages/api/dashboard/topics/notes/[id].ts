import { recordActivity, toUserActor } from '@/lib/activity/record';
import { deleteSource } from '@/lib/agents/sources';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';

export const prerender = false;

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = params.id;

  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The note id is required.');
  }

  await deleteSource(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'source.deleted',
    targetType: 'source',
    targetId: id,
    summary: 'Deleted a research note',
  });

  return jsonOk({ id, deleted: true }, requestId);
});
