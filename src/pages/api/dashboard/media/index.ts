import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { ApiError, jsonOk } from '@/lib/http';
import { resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const store = await resolveMediaStore();
  const items = await store.list();

  return jsonOk({ media: items }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, 'INVALID_FORM', 'Expected multipart form data.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new ApiError(422, 'FILE_REQUIRED', 'A file field is required.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const store = await resolveMediaStore();
  const item = await store.put({ bytes, originalName: file.name });

  await recordActivity({
    ...toUserActor(user),
    action: 'media.uploaded',
    targetType: 'media',
    targetId: item.id,
    summary: `Uploaded "${file.name}"`,
  });

  return jsonOk({ media: item }, requestId, 201);
});
