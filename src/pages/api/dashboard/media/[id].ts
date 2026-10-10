import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { ApiError, jsonOk } from '@/lib/http';
import { resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The media id is required.');
  }

  const store = await resolveMediaStore();
  await store.remove(id);

  await recordActivity({
    ...toUserActor(user),
    action: 'media.deleted',
    targetType: 'media',
    targetId: id,
    summary: `Deleted media "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
