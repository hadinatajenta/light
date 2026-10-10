import { insertActivity } from '../activity/store';

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

async function listDraftRows(db: D1Database): Promise<PostScheduleRow[]> {
  const result = await db
    .prepare(
      `SELECT id, title, status, pub_date FROM posts
       WHERE status = 'draft' AND pub_date IS NOT NULL
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
  const rows = await listDraftRows(db);
  return toScheduledPosts(selectCandidates(rows, scheduledTimestamp, now), null);
}

export async function listDueScheduledPosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<ScheduledPost[]> {
  const rows = await listDraftRows(db);
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
    const result = await db
      .prepare(
        "UPDATE posts SET status = 'published', updated_at = ? WHERE id = ? AND status = 'draft'",
      )
      .bind(updatedAt, post.id)
      .run();

    if (result.meta.changes !== 1) {
      continue;
    }

    published.push(post.id);
    await recordPublishActivity(db, post);
  }

  return { published };
}
