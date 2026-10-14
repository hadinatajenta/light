import { ApiError } from '../http';
import { POST_STATUSES, type PostStatus } from './post-schema';
import { toSlug } from './slug';
import type { PostDocument, PostSummary, SavePostInput } from './types';

interface PostRow {
  id: string;
  title: string;
  description: string;
  seo_title: string | null;
  status: string;
  category: string | null;
  tags: string;
  body: string;
  cover_url: string | null;
  cover_alt: string | null;
  canonical: string | null;
  noindex: number;
  focus_keyword: string | null;
  target_intent: string | null;
  affiliate: number;
  faq: string;
  review_status: string | null;
  pub_date: string | null;
  published_at: string | null;
  updated_date: string | null;
  updated_at: string;
  created_at: string;
}

function readStatus(value: string): PostStatus {
  return (POST_STATUSES as readonly string[]).includes(value) ? (value as PostStatus) : 'draft';
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function toSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    path: `d1:${row.id}`,
    sha: row.updated_at,
    title: row.title,
    description: row.description,
    status: readStatus(row.status),
    category: row.category,
    tags: parseJsonArray(row.tags).filter((tag): tag is string => typeof tag === 'string'),
    coverUrl: row.cover_url,
    coverAlt: row.cover_alt,
    reviewStatus: row.review_status,
    pubDate: row.pub_date,
    updatedDate: row.updated_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDocument(row: PostRow): PostDocument {
  return {
    id: row.id,
    path: `d1:${row.id}`,
    sha: row.updated_at,
    body: row.body,
    data: {
      title: row.title,
      description: row.description,
      seoTitle: row.seo_title ?? undefined,
      status: readStatus(row.status),
      category: row.category ?? undefined,
      tags: toStringArray(parseJsonArray(row.tags)),
      coverUrl: row.cover_url ?? undefined,
      coverAlt: row.cover_alt ?? undefined,
      canonical: row.canonical ?? undefined,
      noindex: row.noindex === 1,
      focusKeyword: row.focus_keyword ?? undefined,
      targetIntent: row.target_intent ?? undefined,
      affiliate: row.affiliate === 1,
      faq: parseJsonArray(row.faq),
      pubDate: row.pub_date ?? undefined,
      updatedDate: row.updated_date ?? undefined,
    },
  };
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readBool(value: unknown): number {
  return value === true ? 1 : 0;
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

export function resolvePublishedAt(
  previousStatus: string,
  nextStatus: string,
  currentPublishedAt: string | null,
  nowIso: string,
): string | null {
  if (nextStatus !== 'published') {
    return currentPublishedAt;
  }

  if (previousStatus === 'published') {
    return currentPublishedAt;
  }

  return currentPublishedAt ?? nowIso;
}

export function createD1Store(db: D1Database) {
  async function requireRow(id: string): Promise<PostRow> {
    const row = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<PostRow>();
    if (!row) {
      throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
    }
    return row;
  }

  return {
    async listPosts(): Promise<PostSummary[]> {
      const result = await db
        .prepare(
          `SELECT id, title, description, status, category, tags, updated_date, updated_at,
                  created_at, pub_date, seo_title, cover_url, cover_alt, review_status, canonical,
                  noindex, focus_keyword, affiliate, faq, body
           FROM posts
           ORDER BY COALESCE(updated_date, pub_date) DESC`,
        )
        .all<PostRow>();

      return (result.results ?? []).map(toSummary);
    },

    async getPost(id: string): Promise<PostDocument> {
      return toDocument(await requireRow(id));
    },

    async createPost(input: SavePostInput): Promise<PostDocument> {
      const id = toSlug(input.id ?? input.slug);
      if (!id) {
        throw new ApiError(422, 'INVALID_SLUG', 'The slug must contain letters or numbers.');
      }

      const existing = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
      if (existing) {
        throw new ApiError(409, 'SLUG_TAKEN', 'A post with that slug already exists.');
      }

      const data = input.data;
      const now = new Date().toISOString();
      const status = readString(data.status, 'draft');
      const publishedAt = status === 'published' ? now : null;

      await db
        .prepare(
          `INSERT INTO posts (id, title, description, seo_title, status, category, tags, body,
            cover_url, cover_alt, canonical, noindex, focus_keyword, target_intent, affiliate, faq,
            pub_date, updated_date, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          readString(data.title, id),
          readString(data.description),
          data.seoTitle ? String(data.seoTitle) : null,
          status,
          data.category ? String(data.category) : null,
          JSON.stringify(toStringArray(data.tags)),
          input.body,
          data.coverUrl ? String(data.coverUrl) : null,
          data.coverAlt ? String(data.coverAlt) : null,
          data.canonical ? String(data.canonical) : null,
          readBool(data.noindex),
          data.focusKeyword ? String(data.focusKeyword) : null,
          data.targetIntent ? String(data.targetIntent) : null,
          readBool(data.affiliate),
          JSON.stringify(Array.isArray(data.faq) ? data.faq : []),
          toIsoOrNull(data.pubDate),
          toIsoOrNull(data.updatedDate),
          publishedAt,
          now,
          now,
        )
        .run();

      return this.getPost(id);
    },

    async updatePost(id: string, input: SavePostInput): Promise<PostDocument> {
      const row = await requireRow(id);

      if (input.expectedSha && input.expectedSha !== row.updated_at) {
        throw new ApiError(
          409,
          'REVISION_CONFLICT',
          'The post changed elsewhere. Reload and retry.',
        );
      }

      const data = input.data;
      const now = new Date().toISOString();
      const nextStatus = readString(data.status, row.status);
      const publishedAt = resolvePublishedAt(row.status, nextStatus, row.published_at, now);

      await db
        .prepare(
          `UPDATE posts SET title = ?, description = ?, seo_title = ?, status = ?, category = ?,
            tags = ?, body = ?, cover_url = ?, cover_alt = ?, canonical = ?, noindex = ?,
            focus_keyword = ?, target_intent = ?, affiliate = ?, faq = ?, pub_date = ?, updated_date = ?, published_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          readString(data.title, row.title),
          readString(data.description, row.description),
          data.seoTitle ? String(data.seoTitle) : null,
          nextStatus,
          data.category ? String(data.category) : null,
          JSON.stringify(toStringArray(data.tags)),
          input.body,
          data.coverUrl ? String(data.coverUrl) : null,
          data.coverAlt ? String(data.coverAlt) : null,
          data.canonical ? String(data.canonical) : null,
          readBool(data.noindex),
          data.focusKeyword ? String(data.focusKeyword) : null,
          data.targetIntent ? String(data.targetIntent) : row.target_intent,
          readBool(data.affiliate),
          JSON.stringify(Array.isArray(data.faq) ? data.faq : []),
          toIsoOrNull(data.pubDate),
          toIsoOrNull(data.updatedDate) ?? now,
          publishedAt,
          now,
          id,
        )
        .run();

      return this.getPost(id);
    },

    async deletePost(id: string): Promise<void> {
      await requireRow(id);
      await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    },
  };
}

export type D1Store = ReturnType<typeof createD1Store>;
