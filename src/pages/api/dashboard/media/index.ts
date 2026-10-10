import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { ApiError, jsonOk } from '@/lib/http';
import { createGitMediaStore } from '@/lib/media/store';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const config = getGithubConfig();
  const items = await createGitMediaStore(config).list();
  return jsonOk({ media: items }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const config = getGithubConfig();

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
  const item = await createGitMediaStore(config).put({ bytes, originalName: file.name });

  return jsonOk({ media: item }, requestId, 201);
});
