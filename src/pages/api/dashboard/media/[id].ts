import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { ApiError, jsonOk } from '@/lib/http';
import { createGitMediaStore } from '@/lib/media/store';

export const prerender = false;

export const DELETE = withAdmin(async ({ params }, requestId) => {
  const config = getGithubConfig();
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The media id is required.');
  }

  await createGitMediaStore(config).remove(id);
  return jsonOk({ id, deleted: true }, requestId);
});
