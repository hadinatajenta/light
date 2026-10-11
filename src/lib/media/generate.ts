import { getPost, updatePost } from '../content/store';
import { ApiError } from '../http';

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const IMAGE_PROMPT_MAX_LENGTH = 2048;
export const IMAGE_STEPS = 4;

const COVER_PROMPT_MAX_LENGTH = 300;
const COVER_SUBJECT_MAX_LENGTH = 48;

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

function stripProductCodes(subject: string): string {
  return subject
    .replace(/\bASIN[:\s-]*[A-Z0-9]+/gi, ' ')
    .replace(/\bSKU[:\s-]*[A-Z0-9-]+/gi, ' ')
    .replace(/\bB0[A-Z0-9]{8}\b/gi, ' ')
    .replace(/\b[A-Z0-9]{8,12}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toCoverPrompt(subject: string): string {
  const cleaned = stripProductCodes(subject).slice(0, COVER_SUBJECT_MAX_LENGTH);
  const topic = cleaned.length > 0 ? cleaned : 'a modern home office';
  const prompt = `Editorial photograph for a home-office buying guide about ${topic}. Clean modern home-office scene, natural window light, shallow depth of field, composition that survives a square crop. No text, no logos, no watermarks, no brand names, no identifiable faces.`;
  return prompt.slice(0, COVER_PROMPT_MAX_LENGTH);
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
