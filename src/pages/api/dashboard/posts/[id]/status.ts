import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { getPost, setPostStatus } from '@/lib/content/post-store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const statusRequestSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
  expectedSha: z.string().optional(),
});

export const POST = withAdmin(async ({ params, request }, requestId) => {
  const config = getGithubConfig();
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The post id is required.');
  }

  const payload = statusRequestSchema.parse(await readJsonBody(request, 10_000));
  const post = await getPost(config, id);

  await setPostStatus(
    config,
    id,
    post.data,
    post.body,
    payload.status,
    `chore(content): set ${id} to ${payload.status}`,
    payload.expectedSha,
  );

  return jsonOk({ id, status: payload.status }, requestId);
});
