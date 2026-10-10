import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { getPost, updatePost } from '@/lib/content/store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const statusRequestSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
  expectedSha: z.string().optional(),
});

export const POST = withAdmin(async ({ params, request }, requestId) => {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The post id is required.');
  }

  const payload = statusRequestSchema.parse(await readJsonBody(request, 10_000));
  const post = await getPost(id);

  await updatePost(id, {
    slug: id,
    data: { ...post.data, status: payload.status, updatedDate: new Date() },
    body: post.body,
    message: `chore(content): set ${id} to ${payload.status}`,
    expectedSha: payload.expectedSha,
  });

  return jsonOk({ id, status: payload.status }, requestId);
});
