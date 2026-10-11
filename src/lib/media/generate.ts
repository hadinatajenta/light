import { getPost, updatePost } from '../content/store';
import { ApiError } from '../http';

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const IMAGE_PROMPT_MAX_LENGTH = 2048;
export const IMAGE_STEPS = 6;

export interface ImageModelBinding {
  run(
    model: string,
    input: { prompt: string; steps?: number; seed?: number },
  ): Promise<{ image: string }>;
}

export async function resolveImageModel(): Promise<ImageModelBinding | null> {
  try {
    const { env } = await import('cloudflare:workers');
    const binding = (env as unknown as { AI?: ImageModelBinding }).AI;
    return binding ?? null;
  } catch {
    return null;
  }
}

export async function generateImageBytes(
  model: ImageModelBinding,
  prompt: string,
  steps: number = IMAGE_STEPS,
): Promise<Uint8Array> {
  let result: { image: string };
  try {
    result = await model.run(IMAGE_MODEL, { prompt, steps });
  } catch {
    throw new ApiError(
      502,
      'IMAGE_GENERATION_FAILED',
      'The image model could not generate an image.',
    );
  }

  const base64 = result?.image;
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new ApiError(502, 'IMAGE_GENERATION_FAILED', 'The image model returned no image.');
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
  } catch {
    throw new ApiError(
      502,
      'IMAGE_GENERATION_FAILED',
      'The image model returned a malformed image.',
    );
  }

  if (bytes.byteLength === 0) {
    throw new ApiError(502, 'IMAGE_GENERATION_FAILED', 'The image model returned no image.');
  }

  return bytes;
}

export async function attachCoverToPost(
  postId: string,
  coverUrl: string,
  coverAlt: string,
): Promise<void> {
  const post = await getPost(postId);
  await updatePost(postId, {
    slug: postId,
    data: { ...post.data, coverUrl, coverAlt },
    body: post.body,
    message: `chore(content): set cover for ${postId}`,
  });
}
