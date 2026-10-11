import { toSlug } from '../content/slug';
import { listPosts, type PostSummary } from '../content/store';
import { ApiError } from '../http';
import { attachCoverToPost, generateImageBytes, IMAGE_STEPS, resolveImageModel } from './generate';
import { buildScenePrompt } from './prompt';
import { type MediaItem, resolveMediaStore } from './store';

export interface CoverAssignment {
  media: MediaItem;
  post: { id: string; title: string };
}

export function postRecency(post: PostSummary): number {
  const value = post.updatedDate ?? post.pubDate;
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function lacksCover(post: PostSummary): boolean {
  return post.status === 'published' && (post.coverUrl ?? '').trim().length === 0;
}

export function listPostsMissingCovers(posts: PostSummary[]): PostSummary[] {
  return posts.filter(lacksCover).sort((first, second) => postRecency(second) - postRecency(first));
}

export async function generateCoverForPost(
  post: PostSummary,
  prompt: string = buildScenePrompt(post.title),
): Promise<CoverAssignment> {
  const model = await resolveImageModel();
  if (!model) {
    throw new ApiError(503, 'IMAGE_MODEL_UNAVAILABLE', 'Image generation is not configured.');
  }

  const bytes = await generateImageBytes(model, prompt, IMAGE_STEPS);
  const store = await resolveMediaStore();
  const media = await store.put({
    bytes,
    originalName: `${toSlug(post.title).slice(0, 40) || 'cover'}.jpg`,
    alt: post.title,
    source: 'generated',
    prompt,
  });

  await attachCoverToPost(post.id, media.url, media.alt);

  return { media, post: { id: post.id, title: post.title } };
}

export async function backfillOneCover(): Promise<CoverAssignment | null> {
  const posts = await listPosts();
  const target = listPostsMissingCovers(posts)[0];

  if (!target) {
    return null;
  }

  return generateCoverForPost(target);
}
