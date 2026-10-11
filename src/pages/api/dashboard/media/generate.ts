import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { toSlug } from '@/lib/content/slug';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import {
  attachCoverToPost,
  generateImageBytes,
  IMAGE_PROMPT_MAX_LENGTH,
  IMAGE_STEPS,
  resolveImageModel,
} from '@/lib/media/generate';
import { MEDIA_ALT_MAX_LENGTH, resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

const generateRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, 'The prompt must be at least 3 characters.')
    .max(
      IMAGE_PROMPT_MAX_LENGTH,
      `The prompt must be ${IMAGE_PROMPT_MAX_LENGTH} characters or fewer.`,
    ),
  alt: z
    .string()
    .trim()
    .max(MEDIA_ALT_MAX_LENGTH, `Alt text must be ${MEDIA_ALT_MAX_LENGTH} characters or fewer.`)
    .optional(),
  attachToPostId: z.string().trim().min(1).max(120).optional(),
});

function summarizePrompt(prompt: string): string {
  return prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
}

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const payload = generateRequestSchema.parse(await readJsonBody(request, 20_000));

  const model = await resolveImageModel();
  if (!model) {
    throw new ApiError(503, 'IMAGE_MODEL_UNAVAILABLE', 'Image generation is not configured.');
  }

  const bytes = await generateImageBytes(model, payload.prompt, IMAGE_STEPS);
  const store = await resolveMediaStore();
  const media = await store.put({
    bytes,
    originalName: `${toSlug(payload.prompt).slice(0, 40) || 'image'}.jpg`,
    alt: payload.alt ?? payload.prompt,
    source: 'generated',
    prompt: payload.prompt,
  });

  if (payload.attachToPostId) {
    await attachCoverToPost(payload.attachToPostId, media.url, media.alt);
  }

  await recordActivity({
    ...toUserActor(user),
    action: 'media.generated',
    targetType: 'media',
    targetId: media.id,
    summary: `Generated an image for "${summarizePrompt(payload.prompt)}"`,
  });

  return jsonOk({ media }, requestId, 201);
});
