import { ApiError } from '../http';
import { detectImageExtension, IMAGE_CONTENT_TYPES } from './image-type';
import {
  MEDIA_ALT_MAX_LENGTH,
  MEDIA_SOURCES,
  type MediaItem,
  type MediaPutInput,
  type MediaSource,
  type MediaStore,
} from './store';

const KEY_PREFIX = 'media/';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 500;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MEDIA_COLUMNS =
  'id, path, url, alt, mime, bytes, created_at, source, source_url, creator, creator_url, license, license_url, prompt';

interface MediaRow {
  id: string;
  path: string;
  url: string;
  alt: string;
  mime: string;
  bytes: number;
  created_at: string;
  source: string | null;
  source_url: string | null;
  creator: string | null;
  creator_url: string | null;
  license: string | null;
  license_url: string | null;
  prompt: string | null;
}

function readSource(value: string | null): MediaSource {
  return value && (MEDIA_SOURCES as readonly string[]).includes(value)
    ? (value as MediaSource)
    : 'upload';
}

function clampAlt(value: string | undefined): string {
  return (value ?? '').slice(0, MEDIA_ALT_MAX_LENGTH);
}

function toItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    path: row.path,
    url: row.url,
    alt: row.alt,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.created_at,
    source: readSource(row.source),
    sourceUrl: row.source_url ?? null,
    creator: row.creator ?? null,
    creatorUrl: row.creator_url ?? null,
    license: row.license ?? null,
    licenseUrl: row.license_url ?? null,
    prompt: row.prompt ?? null,
  };
}

export function createR2MediaStore(db: D1Database, bucket: R2Bucket): MediaStore {
  return {
    async list(): Promise<MediaItem[]> {
      const result = await db
        .prepare(`SELECT ${MEDIA_COLUMNS} FROM media ORDER BY created_at DESC`)
        .all<MediaRow>();

      return (result.results ?? []).map(toItem);
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

      const count = await db
        .prepare('SELECT COUNT(*) AS total FROM media')
        .first<{ total: number }>();

      if ((count?.total ?? 0) >= MAX_ITEMS) {
        throw new ApiError(409, 'MEDIA_LIMIT_REACHED', 'The media library is full.');
      }

      const id = crypto.randomUUID();
      const fileName = `${id}.${extension}`;
      const key = `${KEY_PREFIX}${fileName}`;
      const mime = IMAGE_CONTENT_TYPES[extension];

      await bucket.put(key, input.bytes, {
        httpMetadata: { contentType: mime, cacheControl: IMMUTABLE_CACHE_CONTROL },
      });

      const item: MediaItem = {
        id,
        path: key,
        url: `/media/${fileName}`,
        alt: clampAlt(input.alt),
        mime,
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

      await db
        .prepare(
          `INSERT INTO media (id, path, url, alt, mime, bytes, created_at, source, source_url, creator, creator_url, license, license_url, prompt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          item.path,
          item.url,
          item.alt,
          item.mime,
          item.bytes,
          item.createdAt,
          item.source,
          item.sourceUrl,
          item.creator,
          item.creatorUrl,
          item.license,
          item.licenseUrl,
          item.prompt,
        )
        .run();

      return item;
    },

    async updateAlt(id: string, alt: string): Promise<MediaItem> {
      const row = await db
        .prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`)
        .bind(id)
        .first<MediaRow>();

      if (!row) {
        throw new ApiError(404, 'MEDIA_NOT_FOUND', 'That media item does not exist.');
      }

      await db.prepare('UPDATE media SET alt = ? WHERE id = ?').bind(alt, id).run();

      return toItem({ ...row, alt });
    },

    async remove(id: string): Promise<void> {
      const row = await db
        .prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`)
        .bind(id)
        .first<MediaRow>();

      if (!row) {
        throw new ApiError(404, 'MEDIA_NOT_FOUND', 'That media item does not exist.');
      }

      await bucket.delete(row.path);
      await db.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
    },
  };
}
