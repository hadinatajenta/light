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

interface ScheduledPostRow extends PostScheduleRow {
  pub_date: string;
}

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

export function isScheduled(
  status: string,
  pubDate: string | null | undefined,
  now: Date,
): boolean {
  if (status !== 'draft') {
    return false;
  }

  const timestamp = parsePubDate(pubDate);
  return timestamp !== null && timestamp > now.getTime();
}

export function isDue(status: string, pubDate: string | null | undefined, now: Date): boolean {
  if (status !== 'draft') {
    return false;
  }

  const timestamp = parsePubDate(pubDate);
  return timestamp !== null && timestamp <= now.getTime();
}

function toScheduledPost(row: ScheduledPostRow): ScheduledPost {
  return { id: row.id, title: row.title, pubDate: row.pub_date };
}

export async function listScheduledPosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<ScheduledPost[]> {
  const result = await db
    .prepare(
      `SELECT id, title, status, pub_date FROM posts
       WHERE status = 'draft'
         AND pub_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND pub_date > ?
       ORDER BY pub_date ASC`,
    )
    .bind(now.toISOString())
    .all<PostScheduleRow>();

  return (result.results ?? [])
    .filter((row): row is ScheduledPostRow => isScheduled(row.status, row.pub_date, now))
    .map(toScheduledPost);
}

export async function listDueScheduledPosts(
  db: D1Database,
  now: Date = new Date(),
): Promise<ScheduledPost[]> {
  const result = await db
    .prepare(
      `SELECT id, title, status, pub_date FROM posts
       WHERE status = 'draft'
         AND pub_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
         AND pub_date <= ?
       ORDER BY pub_date ASC
       LIMIT ?`,
    )
    .bind(now.toISOString(), DUE_LIMIT)
    .all<PostScheduleRow>();

  return (result.results ?? [])
    .filter((row): row is ScheduledPostRow => isDue(row.status, row.pub_date, now))
    .map(toScheduledPost);
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
