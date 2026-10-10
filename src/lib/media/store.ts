import { z } from 'astro/zod';
import { getGithubConfig } from '../content/config';
import { deleteFile, type GithubConfig, getFile, putFile, putFileBase64 } from '../content/github';
import { ApiError } from '../http';
import { detectImageExtension, IMAGE_CONTENT_TYPES } from './image-type';
import { createR2MediaStore } from './r2-store';

export const mediaItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  url: z.string(),
  alt: z.string().default(''),
  mime: z.string(),
  bytes: z.number(),
  createdAt: z.string(),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

export interface MediaStore {
  list(): Promise<MediaItem[]>;
  put(input: { bytes: Uint8Array; originalName: string }): Promise<MediaItem>;
  updateAlt(id: string, alt: string): Promise<MediaItem>;
  remove(id: string): Promise<void>;
}

const MEDIA_INDEX_PATH = 'src/data/media.json';
const MEDIA_DIRECTORY = 'public/media';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 500;

export const MEDIA_ALT_MAX_LENGTH = 200;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function readIndex(
  config: GithubConfig,
): Promise<{ items: MediaItem[]; sha: string | null }> {
  const file = await getFile(config, MEDIA_INDEX_PATH);

  if (!file) {
    return { items: [], sha: null };
  }

  const parsed = z.array(mediaItemSchema).safeParse(JSON.parse(file.content));
  if (!parsed.success) {
    throw new ApiError(500, 'MEDIA_INDEX_INVALID', 'The media index is malformed.');
  }

  return { items: parsed.data, sha: file.sha };
}

async function writeIndex(
  config: GithubConfig,
  items: MediaItem[],
  sha: string | null,
  message: string,
): Promise<void> {
  await putFile(
    config,
    MEDIA_INDEX_PATH,
    `${JSON.stringify(items, null, 2)}\n`,
    message,
    sha ?? undefined,
  );
}

export function createGitMediaStore(config: GithubConfig): MediaStore {
  return {
    async list(): Promise<MediaItem[]> {
      const { items } = await readIndex(config);
      return [...items].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    },

    async put(input: { bytes: Uint8Array; originalName: string }): Promise<MediaItem> {
      if (input.bytes.byteLength > MAX_BYTES) {
        throw new ApiError(413, 'FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');
      }

      const extension = detectImageExtension(input.bytes);
      if (!extension) {
        throw new ApiError(
          415,
          'UNSUPPORTED_TYPE',
          'Only JPEG, PNG, GIF, WebP, or AVIF images are allowed.',
        );
      }

      const { items, sha } = await readIndex(config);
      if (items.length >= MAX_ITEMS) {
        throw new ApiError(409, 'MEDIA_LIMIT_REACHED', 'The media library is full.');
      }

      const id = crypto.randomUUID();
      const fileName = `${id}.${extension}`;
      const path = `${MEDIA_DIRECTORY}/${fileName}`;

      await putFileBase64(config, path, toBase64(input.bytes), `chore(media): add ${fileName}`);

      const item: MediaItem = {
        id,
        path,
        url: `/media/${fileName}`,
        alt: '',
        mime: IMAGE_CONTENT_TYPES[extension],
        bytes: input.bytes.byteLength,
        createdAt: new Date().toISOString(),
      };

      await writeIndex(config, [item, ...items], sha, `chore(media): index ${fileName}`);

      return item;
    },

    async updateAlt(id: string, alt: string): Promise<MediaItem> {
      const { items, sha } = await readIndex(config);
      const item = items.find((entry) => entry.id === id);

      if (!item) {
        throw new ApiError(404, 'MEDIA_NOT_FOUND', 'That media item does not exist.');
      }

      const updated: MediaItem = { ...item, alt };

      await writeIndex(
        config,
        items.map((entry) => (entry.id === id ? updated : entry)),
        sha,
        `chore(media): update alt for ${item.path}`,
      );

      return updated;
    },

    async remove(id: string): Promise<void> {
      const { items, sha } = await readIndex(config);
      const item = items.find((entry) => entry.id === id);

      if (!item) {
        throw new ApiError(404, 'MEDIA_NOT_FOUND', 'That media item does not exist.');
      }

      const file = await getFile(config, item.path);
      if (file) {
        await deleteFile(config, item.path, `chore(media): remove ${item.path}`, file.sha);
      }

      await writeIndex(
        config,
        items.filter((entry) => entry.id !== id),
        sha,
        `chore(media): unindex ${item.path}`,
      );
    },
  };
}

async function resolveMediaBindings(): Promise<{ database: D1Database; bucket: R2Bucket } | null> {
  try {
    const { env } = await import('cloudflare:workers');
    const bindings = env as unknown as { CONTENT_DB?: D1Database; MEDIA_BUCKET?: R2Bucket };

    if (!bindings.CONTENT_DB || !bindings.MEDIA_BUCKET) {
      return null;
    }

    return { database: bindings.CONTENT_DB, bucket: bindings.MEDIA_BUCKET };
  } catch {
    return null;
  }
}

export async function resolveMediaStore(): Promise<MediaStore> {
  const bindings = await resolveMediaBindings();
  if (bindings) {
    return createR2MediaStore(bindings.database, bindings.bucket);
  }

  return createGitMediaStore(getGithubConfig());
}
