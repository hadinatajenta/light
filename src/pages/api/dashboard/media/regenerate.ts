import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { toSlug } from '@/lib/content/slug';
import { listPosts } from '@/lib/content/store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import {
  attachCoverToPost,
  generateImageBytes,
  IMAGE_STEPS,
  resolveImageModel,
} from '@/lib/media/generate';
import { buildScenePrompt } from '@/lib/media/prompt';
import { resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

const regenerateRequestSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const payload = regenerateRequestSchema.parse(await readJsonBody(request, 10_000));

  const store = await resolveMediaStore();
  const item = await store.get(payload.id);

  if (item.source !== 'generated') {
    throw new ApiError(422, 'NOT_GENERATED', 'Only generated images can be regenerated.');
  }

  const model = await resolveImageModel();
  if (!model) {
    throw new ApiError(503, 'IMAGE_MODEL_UNAVAILABLE', 'Image generation is not configured.');
  }

  const posts = await listPosts();
  const affected = posts.filter((post) => post.coverUrl === item.url);
  const subject = affected[0]?.title ?? item.alt;
  const prompt = affected[0]
    ? buildScenePrompt(affected[0].title)
    : (item.prompt ?? buildScenePrompt(item.alt));

  const bytes = await generateImageBytes(model, prompt, IMAGE_STEPS);
  const media = await store.put({
    bytes,
    originalName: `${toSlug(subject).slice(0, 40) || 'cover'}.jpg`,
    alt: subject,
    source: 'generated',
    prompt,
  });

  for (const post of affected) {
    await attachCoverToPost(post.id, media.url, post.coverAlt ?? media.alt);
  }

  await store.remove(item.id);

  await recordActivity({
    ...toUserActor(user),
    action: 'media.regenerated',
    targetType: 'media',
    targetId: media.id,
    summary: `Regenerated the cover for "${subject}"`,
  });

  return jsonOk({ media, posts: affected.map((post) => post.id) }, requestId, 201);
});
