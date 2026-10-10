import { withAdmin } from '@/lib/api/handler';
import { getGithubConfig } from '@/lib/content/config';
import { listPosts } from '@/lib/content/post-store';
import { jsonOk } from '@/lib/http';
import { collectTags } from '@/utils/posts';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const config = getGithubConfig();
  const posts = await listPosts(config);
  const tags = collectTags(posts.map((post) => ({ data: { tags: post.tags } })));

  return jsonOk({ tags }, requestId);
});
