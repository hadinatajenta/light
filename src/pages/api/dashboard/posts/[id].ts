import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { postFrontmatterSchema } from '@/lib/content/post-schema';
import { deletePost, getPost, updatePost } from '@/lib/content/store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const savePostRequestSchema = z.object({
  slug: z.string().min(1).max(80),
  body: z.string().max(200_000),
  frontmatter: postFrontmatterSchema,
  expectedSha: z.string().optional(),
});

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The post id is required.');
  }
  return id;
}

export const GET = withAdmin(async ({ params }, requestId) => {
  const post = await getPost(requireId(params));
  return jsonOk({ id: post.id, sha: post.sha, frontmatter: post.data, body: post.body }, requestId);
});

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const id = requireId(params);
  const payload = savePostRequestSchema.parse(await readJsonBody(request, 300_000));

  const post = await updatePost(id, {
    slug: payload.slug,
    data: {
      ...payload.frontmatter,
      slug: payload.slug,
      pubDate: payload.frontmatter.pubDate,
      updatedDate: new Date(),
    },
    body: payload.body,
    message: `feat(content): update ${id}`,
    expectedSha: payload.expectedSha,
  });

  await recordActivity({
    ...toUserActor(user),
    action: 'post.updated',
    targetType: 'post',
    targetId: post.id,
    summary: `Updated post "${payload.frontmatter.title}"`,
  });

  return jsonOk({ id: post.id, sha: post.sha }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const id = requireId(params);
  await deletePost(id);

  await recordActivity({
    ...toUserActor(user),
    action: 'post.deleted',
    targetType: 'post',
    targetId: id,
    summary: `Deleted post "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
