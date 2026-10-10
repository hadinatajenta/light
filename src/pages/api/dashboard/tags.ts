import { withAdmin } from '@/lib/api/handler';
import { listPosts } from '@/lib/content/store';
import { jsonOk } from '@/lib/http';
import { collectTags } from '@/utils/posts';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const posts = await listPosts();
  const tags = collectTags(posts.map((post) => ({ data: { tags: post.tags } })));

  return jsonOk({ tags }, requestId);
});
