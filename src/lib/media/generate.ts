import { getPost, updatePost } from '../content/store';
import { ApiError } from '../http';

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const IMAGE_PROMPT_MAX_LENGTH = 2048;
export const IMAGE_STEPS = 4;
export const IMAGE_ERROR_DETAIL_MAX_LENGTH = 300;

const RETRY_DELAY_MS = 800;

export interface ImageModelBinding {
  run(
    model: string,
    input: { prompt: string; steps?: number; seed?: number },
  ): Promise<{ image: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  const maxAttempts = Math.max(attempts, 1);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
    result = await withRetry(() => model.run(IMAGE_MODEL, { prompt, steps }));
  } catch (error) {
    console.error('Image model generation failed', error);
    const cause = (error instanceof Error ? error.message : String(error)).slice(
      0,
      IMAGE_ERROR_DETAIL_MAX_LENGTH,
    );
    throw new ApiError(
      502,
      'IMAGE_GENERATION_FAILED',
      'The image model could not generate an image.',
      { cause },
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
