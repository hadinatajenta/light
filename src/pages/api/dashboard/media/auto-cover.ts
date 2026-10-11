import { recordActivity, toUserActor } from '@/lib/activity/record';
import { readBudgetState } from '@/lib/agents/budget';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { listPosts } from '@/lib/content/store';
import { ApiError, jsonOk } from '@/lib/http';
import { backfillOneCover, listPostsMissingCovers } from '@/lib/media/covers';

export const prerender = false;

export const POST = withAdmin(async (_context, requestId, user) => {
  const database = await requireContentDatabase();
  const budget = await readBudgetState(database);

  if (budget.coversExhausted) {
    throw new ApiError(
      429,
      'COVER_BUDGET_REACHED',
      'The daily cover generation limit has been reached. Raise it in the spending budget to generate more.',
    );
  }

  const missing = listPostsMissingCovers(await listPosts());
  const assignment = await backfillOneCover(database);

  if (!assignment) {
    return jsonOk({ media: null, post: null, remaining: 0 }, requestId);
  }

  await recordActivity({
    ...toUserActor(user),
    action: 'media.auto_covered',
    targetType: 'media',
    targetId: assignment.media.id,
    summary: `Generated a cover for "${assignment.post.title}"`,
  });

  return jsonOk(
    {
      media: assignment.media,
      post: assignment.post,
      remaining: Math.max(missing.length - 1, 0),
    },
    requestId,
  );
});
