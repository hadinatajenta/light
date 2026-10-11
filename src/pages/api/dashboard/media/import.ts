import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { toSlug } from '@/lib/content/slug';
import { jsonOk, readJsonBody } from '@/lib/http';
import { attachCoverToPost } from '@/lib/media/generate';
import { detectImageExtension } from '@/lib/media/image-type';
import { downloadImageBytes } from '@/lib/media/search';
import { MEDIA_ALT_MAX_LENGTH, resolveMediaStore } from '@/lib/media/store';

export const prerender = false;

const importRequestSchema = z.object({
  imageUrl: z.string().trim().min(1).max(2048),
  title: z.string().trim().min(1).max(200).optional(),
  alt: z
    .string()
    .trim()
    .max(MEDIA_ALT_MAX_LENGTH, `Alt text must be ${MEDIA_ALT_MAX_LENGTH} characters or fewer.`)
    .optional(),
  creator: z.string().trim().max(200).nullable().optional(),
  creatorUrl: z.string().trim().max(2048).nullable().optional(),
  license: z.string().trim().max(100).nullable().optional(),
  licenseUrl: z.string().trim().max(2048).nullable().optional(),
  sourceUrl: z.string().trim().max(2048).nullable().optional(),
  attachToPostId: z.string().trim().min(1).max(120).optional(),
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const payload = importRequestSchema.parse(await readJsonBody(request, 20_000));

  const bytes = await downloadImageBytes(payload.imageUrl);
  const extension = detectImageExtension(bytes) ?? 'jpg';
  const title = payload.title ?? null;

  const store = await resolveMediaStore();
  const media = await store.put({
    bytes,
    originalName: `${toSlug(title ?? 'image').slice(0, 40) || 'image'}.${extension}`,
    alt: payload.alt ?? title ?? '',
    source: 'search',
    sourceUrl: payload.sourceUrl ?? null,
    creator: payload.creator ?? null,
    creatorUrl: payload.creatorUrl ?? null,
    license: payload.license ?? null,
    licenseUrl: payload.licenseUrl ?? null,
  });

  if (payload.attachToPostId) {
    await attachCoverToPost(payload.attachToPostId, media.url, media.alt);
  }

  await recordActivity({
    ...toUserActor(user),
    action: 'media.imported',
    targetType: 'media',
    targetId: media.id,
    summary: `Imported "${title ?? 'image'}"`,
  });

  return jsonOk({ media }, requestId, 201);
});
