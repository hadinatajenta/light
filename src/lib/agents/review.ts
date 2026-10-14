import { toSlug } from '../content/slug';
import { createPost } from '../content/store';
import { notifyIndexNow } from '../seo/indexnow';
import { type ReviewClaimStage, type ReviewStage, reviewStageFilter } from './review-stages';
import type { AgentRecord } from './store';

export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'changes_requested';

export interface DraftTarget {
  id: string;
  title: string;
  description: string;
  body: string;
}

interface DraftRow {
  id: string;
  title: string;
  description: string;
  body: string;
}

async function slugExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(slug).first();
  return Boolean(row);
}

export async function buildUniqueSlug(db: D1Database, title: string): Promise<string> {
  const base = toSlug(title).slice(0, 72) || `draft-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (await slugExists(db, candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function findPendingDraft(db: D1Database): Promise<DraftTarget | null> {
  const row = await db
    .prepare(
      `SELECT id, title, description, body FROM posts
       WHERE status = 'draft' AND (review_status IS NULL OR review_status = 'pending')
       ORDER BY created_at ASC LIMIT 1`,
    )
    .first<DraftRow>();

  return row
    ? { id: row.id, title: row.title, description: row.description, body: row.body }
    : null;
}

export async function claimPendingDraft(
  db: D1Database,
  agentId: string,
  stage: ReviewClaimStage,
): Promise<DraftTarget | null> {
  const now = new Date().toISOString();
  const stageFilter = reviewStageFilter(stage);
  const row = await db
    .prepare(
      `UPDATE posts SET review_status = 'in_review', reviewed_by = ?, reviewed_at = ?
       WHERE id = (
         SELECT id FROM posts
         WHERE status = 'draft' AND (review_status IS NULL OR review_status = 'pending')
           AND ${stageFilter}
         ORDER BY created_at ASC LIMIT 1
       )
         AND status = 'draft' AND (review_status IS NULL OR review_status = 'pending')
         AND ${stageFilter}
       RETURNING id, title, description, body`,
    )
    .bind(agentId, now)
    .first<DraftRow>();

  return row
    ? { id: row.id, title: row.title, description: row.description, body: row.body }
    : null;
}

export async function releaseClaimedDraft(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE posts SET review_status = 'pending', updated_at = ? WHERE id = ? AND review_status = 'in_review'",
    )
    .bind(new Date().toISOString(), id)
    .run();
}

export async function listRecentPublishedTitles(db: D1Database, limit = 12): Promise<string[]> {
  const result = await db
    .prepare(
      "SELECT title FROM posts WHERE status = 'published' ORDER BY COALESCE(pub_date, created_at) DESC LIMIT ?",
    )
    .bind(limit)
    .all<{ title: string }>();

  return (result.results ?? []).map((row) => row.title);
}

export interface RecentPublishedPost {
  id: string;
  title: string;
}

export async function listRecentPublishedPosts(
  db: D1Database,
  limit = 12,
): Promise<RecentPublishedPost[]> {
  const result = await db
    .prepare(
      "SELECT id, title FROM posts WHERE status = 'published' ORDER BY COALESCE(pub_date, created_at) DESC LIMIT ?",
    )
    .bind(limit)
    .all<{ id: string; title: string }>();

  return (result.results ?? []).map((row) => ({ id: row.id, title: row.title }));
}

export async function setPostReview(
  db: D1Database,
  id: string,
  status: ReviewStatus,
  reviewerId: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE posts SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
    .bind(status, reviewerId, new Date().toISOString(), id)
    .run();
}

export async function setPostStage(db: D1Database, id: string, stage: ReviewStage): Promise<void> {
  await db
    .prepare('UPDATE posts SET review_stage = ?, updated_at = ? WHERE id = ?')
    .bind(stage, new Date().toISOString(), id)
    .run();
}

export async function schedulePostPublish(
  db: D1Database,
  id: string,
  pubDateIso: string,
): Promise<void> {
  await db
    .prepare('UPDATE posts SET pub_date = ?, updated_at = ? WHERE id = ?')
    .bind(pubDateIso, new Date().toISOString(), id)
    .run();
}

export async function publishPost(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      "UPDATE posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
    )
    .bind(now, now, id)
    .run();

  try {
    await notifyIndexNow([`/blog/${id}`]);
  } catch (error) {
    console.error('IndexNow ping failed for agent publish', id, error);
  }
}

export async function updateDraftBody(
  db: D1Database,
  id: string,
  input: { title?: string; description?: string; body?: string },
): Promise<void> {
  const assignments: string[] = [];
  const bindings: unknown[] = [];

  if (input.title) {
    assignments.push('title = ?');
    bindings.push(input.title);
  }
  if (input.description) {
    assignments.push('description = ?');
    bindings.push(input.description);
  }
  if (input.body) {
    assignments.push('body = ?');
    bindings.push(input.body);
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id);

  await db
    .prepare(`UPDATE posts SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();
}

export async function createDraftPost(
  db: D1Database,
  agent: AgentRecord,
  input: {
    title: string;
    description: string;
    tags: string[];
    body: string;
    category?: string | null;
  },
): Promise<string> {
  const slug = await buildUniqueSlug(db, input.title);

  const data: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    status: 'draft',
    tags: input.tags,
    pubDate: new Date(),
    noindex: false,
    affiliate: false,
    faq: [],
  };

  if (input.category) {
    data.category = input.category;
  }

  const document = await createPost({
    slug,
    data,
    body: input.body,
    message: `feat(content): draft ${slug}`,
  });

  await setPostReview(db, document.id, 'pending', agent.id);

  return document.id;
}
