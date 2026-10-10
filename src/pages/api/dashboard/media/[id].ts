import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { MEDIA_ALT_MAX_LENGTH, resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

const altRequestSchema = z.object({
  alt: z
    .string()
    .trim()
    .max(MEDIA_ALT_MAX_LENGTH, `Alt text must be ${MEDIA_ALT_MAX_LENGTH} characters or fewer.`),
});

export const PATCH = withAdmin(async ({ params, request }, requestId, user) => {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The media id is required.');
  }

  const payload = altRequestSchema.parse(await readJsonBody(request, 10_000));
  const store = await resolveMediaStore();
  const media = await store.updateAlt(id, payload.alt);

  await recordActivity({
    ...toUserActor(user),
    action: 'media.alt_updated',
    targetType: 'media',
    targetId: id,
    summary: `Updated alt text for "${id}"`,
  });

  return jsonOk({ media }, requestId);
});

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
