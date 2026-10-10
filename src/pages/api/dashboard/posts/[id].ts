import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { postFrontmatterSchema } from '@/lib/content/post-schema';
import { deletePost, getPost, updatePost } from '@/lib/content/post-store';
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
  const config = getGithubConfig();
  const post = await getPost(config, requireId(params));
  return jsonOk({ id: post.id, sha: post.sha, frontmatter: post.data, body: post.body }, requestId);
});

export const PUT = withAdmin(async ({ params, request }, requestId) => {
  const config = getGithubConfig();
  const id = requireId(params);
  const payload = savePostRequestSchema.parse(await readJsonBody(request, 300_000));

  const post = await updatePost(config, id, {
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

  return jsonOk({ id: post.id, sha: post.sha }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId) => {
  const config = getGithubConfig();
  const id = requireId(params);
  await deletePost(config, id, `chore(content): delete ${id}`);
  return jsonOk({ id, deleted: true }, requestId);
});
