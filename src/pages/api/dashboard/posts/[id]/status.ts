import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { getPost, updatePost } from '@/lib/content/store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { notify } from '@/lib/notifications/notify';
import { notifyIndexNow } from '@/lib/seo/indexnow';

export const prerender = false;

const statusRequestSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
  expectedSha: z.string().optional(),
});

export const POST = withAdmin(async ({ params, request }, requestId, user) => {
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

  await recordActivity({
    ...toUserActor(user),
    action: `post.${payload.status}`,
    targetType: 'post',
    targetId: id,
    summary: `Set "${id}" to ${payload.status}`,
  });

  if (payload.status === 'published') {
    await notify({
      event: 'post.published',
      title: `Published "${post.data.title ?? id}"`,
      body: 'The post was published manually from the dashboard.',
      link: `/dashboard/posts/${id}/edit`,
      actorLabel: user.email,
      dedupeSubject: id,
      metadata: { postId: id, source: 'dashboard' },
    });

    try {
      await notifyIndexNow([`/blog/${id}`]);
    } catch (error) {
      console.error('IndexNow ping failed for dashboard publish', id, error);
    }
  }

  return jsonOk({ id, status: payload.status }, requestId);
});
