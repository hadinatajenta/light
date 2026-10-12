import { insertActivity } from '../activity/store';
import { postPassesResearchGate } from '../agents/sources';
import { notify } from '../notifications/notify';
import { notifyIndexNow } from '../seo/indexnow';

export interface ScheduledPost {
  id: string;
  title: string;
  pubDate: string;
}

interface PostScheduleRow {
  id: string;
  title: string;
  status: string;
  pub_date: string | null;
  review_status: string | null;
}

interface ScheduledCandidate {
  post: ScheduledPost;
  timestamp: number;
}

type TimestampResolver = (status: string, pubDate: string | null, now: Date) => number | null;

const DUE_LIMIT = 20;
const PUB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULER_ACTOR = {
  actorId: 'scheduler',
  actorType: 'agent',
  actorLabel: 'Scheduler',
} as const;

function parsePubDate(pubDate: string | null | undefined): number | null {
  if (typeof pubDate !== 'string') {
    return null;
  }

  const value = pubDate.trim();
  if (value === '') {
    return null;
  }

  const timestamp = PUB_DATE_PATTERN.test(value)
    ? Date.parse(`${value}T00:00:00.000Z`)
    : Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function scheduledTimestamp(status: string, pubDate: string | null, now: Date): number | null {
  if (status !== 'draft') {
    return null;
  }

  const timestamp = parsePubDate(pubDate);
  return timestamp !== null && timestamp > now.getTime() ? timestamp : null;
}

function dueTimestamp(status: string, pubDate: string | null, now: Date): number | null {
  if (status !== 'draft') {
    return null;
  }

  const timestamp = parsePubDate(pubDate);
  return timestamp !== null && timestamp <= now.getTime() ? timestamp : null;
}

export function isScheduled(
  status: string,
  pubDate: string | null | undefined,
  now: Date,
): boolean {
  return scheduledTimestamp(status, pubDate ?? null, now) !== null;
}

export function isDue(status: string, pubDate: string | null | undefined, now: Date): boolean {
  return dueTimestamp(status, pubDate ?? null, now) !== null;
}

async function listDraftRows(db: D1Database, onlyApproved: boolean): Promise<PostScheduleRow[]> {
  const condition = onlyApproved
    ? "AND review_status = 'approved' AND review_stage = 'fact_check_passed'"
    : '';
  const result = await db
    .prepare(
      `SELECT id, title, status, pub_date, review_status FROM posts
       WHERE status = 'draft' AND pub_date IS NOT NULL ${condition}
       ORDER BY pub_date ASC`,
    )
    .all<PostScheduleRow>();

  return result.results ?? [];
}

function selectCandidates(
  rows: PostScheduleRow[],
  resolveTimestamp: TimestampResolver,
  now: Date,
): ScheduledCandidate[] {
  const candidates: ScheduledCandidate[] = [];

  for (const row of rows) {
    const pubDate = row.pub_date;
    if (pubDate === null) {
      continue;
    }

    const timestamp = resolveTimestamp(row.status, pubDate, now);
    if (timestamp === null) {
      continue;
    }

    candidates.push({
      post: { id: row.id, title: row.title, pubDate },
      timestamp,
    });
  }

  return candidates.sort((first, second) => first.timestamp - second.timestamp);
}

function toScheduledPosts(candidates: ScheduledCandidate[], limit: number | null): ScheduledPost[] {
  const posts = candidates.map((candidate) => candidate.post);
  return limit === null ? posts : posts.slice(0, limit);
}

export async function listScheduledPosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<ScheduledPost[]> {
  const rows = await listDraftRows(db, false);
  return toScheduledPosts(selectCandidates(rows, scheduledTimestamp, now), null);
}

export async function listDueScheduledPosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<ScheduledPost[]> {
  const rows = await listDraftRows(db, true);
  return toScheduledPosts(selectCandidates(rows, dueTimestamp, now), DUE_LIMIT);
}

async function recordPublishActivity(db: D1Database, post: ScheduledPost): Promise<void> {
  try {
    await insertActivity(db, {
      ...SCHEDULER_ACTOR,
      action: 'post.published',
      targetType: 'post',
      targetId: post.id,
      summary: `Published "${post.title}" on schedule`,
    });
  } catch (error) {
    console.error('Failed to record activity', 'post.published', error);
  }
}

export async function publishDuePosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<{ published: string[] }> {
  const duePosts = await listDueScheduledPosts(db, now);
  const published: string[] = [];
  const updatedAt = now.toISOString();

  for (const post of duePosts) {
    if (!(await postPassesResearchGate(db, post.id))) {
      continue;
    }

    const result = await db
      .prepare(
        "UPDATE posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ? AND status = 'draft' AND review_status = 'approved' AND review_stage = 'fact_check_passed'",
      )
      .bind(updatedAt, updatedAt, post.id)
      .run();

    if (result.meta.changes !== 1) {
      continue;
    }

    published.push(post.id);
    await recordPublishActivity(db, post);

    await notify({
      event: 'post.published',
      title: `Published "${post.title}"`,
      body: 'The post was published automatically on its schedule.',
      link: `/dashboard/posts/${post.id}/edit`,
      actorLabel: 'Scheduler',
      dedupeSubject: post.id,
      metadata: { postId: post.id, source: 'schedule' },
    });

    try {
      await notifyIndexNow([`/blog/${post.id}`]);
    } catch (error) {
      console.error('IndexNow ping failed for scheduled publish', post.id, error);
    }
  }

  return { published };
}

export async function countPublishedSince(db: D1Database, sinceIso: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'published' AND published_at >= ?")
    .bind(sinceIso)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function readLastPublishedAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT published_at FROM posts WHERE status = 'published' AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1",
    )
    .first<{ published_at: string }>();

  return row?.published_at ?? null;
}
