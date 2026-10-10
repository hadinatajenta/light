import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { deletePost, getPost, setPostStatus } from '@/lib/content/post-store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const bulkRequestSchema = z.object({
  action: z.enum(['archive', 'delete']),
  ids: z.array(z.string().min(1).max(120)).min(1).max(100),
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const config = getGithubConfig();
  const payload = bulkRequestSchema.parse(await readJsonBody(request, 20_000));

  if (payload.action === 'delete') {
    await Promise.all(
      payload.ids.map((id) => deletePost(config, id, `chore(content): delete ${id}`)),
    );
    return jsonOk({ action: 'delete', affected: payload.ids.length }, requestId);
  }

  for (const id of payload.ids) {
    const post = await getPost(config, id);

    if (post.data.status === 'archived') {
      throw new ApiError(409, 'ALREADY_ARCHIVED', `The post ${id} is already archived.`);
    }
  }

  await Promise.all(
    payload.ids.map(async (id) => {
      const post = await getPost(config, id);
      await setPostStatus(
        config,
        id,
        post.data,
        post.body,
        'archived',
        `chore(content): archive ${id}`,
      );
    }),
  );

  return jsonOk({ action: 'archive', affected: payload.ids.length }, requestId);
});
