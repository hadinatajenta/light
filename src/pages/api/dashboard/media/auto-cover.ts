import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { listPosts } from '@/lib/content/store';
import { jsonOk } from '@/lib/http';
import { generateCoverForPost, listPostsMissingCovers } from '@/lib/media/covers';

export const prerender = false;

export const POST = withAdmin(async (_context, requestId, user) => {
  const posts = await listPosts();
  const missing = listPostsMissingCovers(posts);
  const target = missing[0];

  if (!target) {
    return jsonOk({ media: null, post: null, remaining: 0 }, requestId);
  }

  const assignment = await generateCoverForPost(target);

  await recordActivity({
    ...toUserActor(user),
    action: 'media.auto_covered',
    targetType: 'media',
    targetId: assignment.media.id,
    summary: `Generated a cover for "${assignment.post.title}"`,
  });

  return jsonOk(
    { media: assignment.media, post: assignment.post, remaining: missing.length - 1 },
    requestId,
  );
});
