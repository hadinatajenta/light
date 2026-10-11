import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { toSlug } from '@/lib/content/slug';
import { listPosts, type PostSummary } from '@/lib/content/store';
import { ApiError, jsonOk } from '@/lib/http';
import {
  attachCoverToPost,
  generateImageBytes,
  IMAGE_STEPS,
  resolveImageModel,
} from '@/lib/media/generate';
import { buildScenePrompt } from '@/lib/media/prompt';
import { resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

function postRecency(post: PostSummary): number {
  const value = post.updatedDate ?? post.pubDate;
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function lacksCover(post: PostSummary): boolean {
  return post.status === 'published' && (post.coverUrl ?? '').trim().length === 0;
}

export const POST = withAdmin(async (_context, requestId, user) => {
  const model = await resolveImageModel();
  if (!model) {
    throw new ApiError(503, 'IMAGE_MODEL_UNAVAILABLE', 'Image generation is not configured.');
  }

  const posts = await listPosts();
  const missing = posts
    .filter(lacksCover)
    .sort((first, second) => postRecency(second) - postRecency(first));
  const target = missing[0];

  if (!target) {
    return jsonOk({ media: null, post: null, remaining: 0 }, requestId);
  }

  const prompt = buildScenePrompt(target.title);
  const bytes = await generateImageBytes(model, prompt, IMAGE_STEPS);
  const store = await resolveMediaStore();
  const media = await store.put({
    bytes,
    originalName: `${toSlug(target.title).slice(0, 40) || 'cover'}.jpg`,
    alt: target.title,
    source: 'generated',
    prompt,
  });

  await attachCoverToPost(target.id, media.url, media.alt);

  await recordActivity({
    ...toUserActor(user),
    action: 'media.auto_covered',
    targetType: 'media',
    targetId: media.id,
    summary: `Generated a cover for "${target.title}"`,
  });

  return jsonOk(
    { media, post: { id: target.id, title: target.title }, remaining: missing.length - 1 },
    requestId,
  );
});
