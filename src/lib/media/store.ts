import { z } from 'astro/zod';
import { getGithubConfig } from '../content/config';
import { deleteFile, type GithubConfig, getFile, putFile, putFileBase64 } from '../content/github';
import { ApiError } from '../http';
import { detectImageExtension, IMAGE_CONTENT_TYPES } from './image-type';
import { createR2MediaStore } from './r2-store';

export const MEDIA_SOURCES = ['upload', 'generated', 'search'] as const;

export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const mediaItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  url: z.string(),
  alt: z.string().default(''),
  mime: z.string(),
  bytes: z.number(),
  createdAt: z.string(),
  source: z.enum(MEDIA_SOURCES).default('upload'),
  sourceUrl: z.string().nullable().default(null),
  creator: z.string().nullable().default(null),
  creatorUrl: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  licenseUrl: z.string().nullable().default(null),
  prompt: z.string().nullable().default(null),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

export interface MediaPutInput {
  bytes: Uint8Array;
  originalName: string;
  alt?: string;
  source?: MediaSource;
  sourceUrl?: string | null;
  creator?: string | null;
  creatorUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  prompt?: string | null;
}

export interface MediaStore {
  list(): Promise<MediaItem[]>;
  get(id: string): Promise<MediaItem>;
  put(input: MediaPutInput): Promise<MediaItem>;
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

function clampAlt(value: string | undefined): string {
  return (value ?? '').slice(0, MEDIA_ALT_MAX_LENGTH);
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

    async get(id: string): Promise<MediaItem> {
      const { items } = await readIndex(config);
      const item = items.find((entry) => entry.id === id);

      if (!item) {
        throw new ApiError(404, 'MEDIA_NOT_FOUND', 'That media item does not exist.');
      }

      return item;
    },

    async put(input: MediaPutInput): Promise<MediaItem> {
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
        alt: clampAlt(input.alt),
        mime: IMAGE_CONTENT_TYPES[extension],
        bytes: input.bytes.byteLength,
        createdAt: new Date().toISOString(),
        source: input.source ?? 'upload',
        sourceUrl: input.sourceUrl ?? null,
        creator: input.creator ?? null,
        creatorUrl: input.creatorUrl ?? null,
        license: input.license ?? null,
        licenseUrl: input.licenseUrl ?? null,
        prompt: input.prompt ?? null,
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

export interface MediaCredit {
  creator: string | null;
  creatorUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

interface MediaCreditRow {
  creator: string | null;
  creator_url: string | null;
  license: string | null;
  license_url: string | null;
  source_url: string | null;
}

export async function findMediaCreditByUrl(url: string): Promise<MediaCredit | null> {
  try {
    const bindings = await resolveMediaBindings();
    if (!bindings) {
      return null;
    }

    const row = await bindings.database
      .prepare(
        `SELECT creator, creator_url, license, license_url, source_url
         FROM media WHERE url = ? AND source = 'search' LIMIT 1`,
      )
      .bind(url)
      .first<MediaCreditRow>();

    if (!row) {
      return null;
    }

    return {
      creator: row.creator ?? null,
      creatorUrl: row.creator_url ?? null,
      license: row.license ?? null,
      licenseUrl: row.license_url ?? null,
      sourceUrl: row.source_url ?? null,
    };
  } catch {
    return null;
  }
}
