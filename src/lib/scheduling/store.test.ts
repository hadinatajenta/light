import { describe, expect, it } from 'vitest';
import {
  isDue,
  isScheduled,
  listDueScheduledPosts,
  listScheduledPosts,
  publishDuePosts,
} from './store';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const FUTURE_PUB_DATE = '2026-10-12T09:00:00.000Z';
const PAST_PUB_DATE = '2026-10-10T09:00:00.000Z';
const FUTURE_STORED_PUB_DATE = 'Mon Oct 12 2026 09:00:00 GMT+0000 (Coordinated Universal Time)';
const PAST_STORED_PUB_DATE = 'Sat Oct 10 2026 09:00:00 GMT+0000 (Coordinated Universal Time)';

interface FakePostRow {
  id: string;
  title: string;
  status: string;
  pub_date: string | null;
}

interface FakeWrite {
  sql: string;
  params: unknown[];
}

function postRow(id: string, status: string, pubDate: string | null, title = id): FakePostRow {
  return { id, title, status, pub_date: pubDate };
}

function createFakeDatabase(options: { rows: FakePostRow[]; updateChanges: number[] }): {
  database: D1Database;
  writeLog: FakeWrite[];
} {
  const writeLog: FakeWrite[] = [];
  let updateIndex = 0;

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all() {
          return { results: options.rows };
        },
        async run() {
          writeLog.push({ sql, params });
          const isGuardedUpdate = sql.includes('UPDATE posts');
          const changes = isGuardedUpdate ? (options.updateChanges[updateIndex] ?? 0) : 1;
          if (isGuardedUpdate) {
            updateIndex += 1;
          }
          return { meta: { changes } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writeLog };
}

describe('isScheduled', () => {
  it('treats a draft with a future publication date as scheduled', () => {
    expect(isScheduled('draft', FUTURE_PUB_DATE, NOW)).toBe(true);
    expect(isDue('draft', FUTURE_PUB_DATE, NOW)).toBe(false);
  });

  it('treats a draft with a past publication date as due', () => {
    expect(isScheduled('draft', PAST_PUB_DATE, NOW)).toBe(false);
    expect(isDue('draft', PAST_PUB_DATE, NOW)).toBe(true);
  });

  it('treats a publication date exactly at now as due rather than scheduled', () => {
    expect(isScheduled('draft', NOW.toISOString(), NOW)).toBe(false);
    expect(isDue('draft', NOW.toISOString(), NOW)).toBe(true);
  });

  it('treats a date-only publication date as the start of that day in UTC', () => {
    expect(isScheduled('draft', '2026-10-12', NOW)).toBe(true);
    expect(isDue('draft', '2026-10-11', NOW)).toBe(true);
    expect(isScheduled('draft', '2026-10-11', NOW)).toBe(false);
  });

  it('parses the date format the content store writes for dashboard and agent posts', () => {
    expect(isScheduled('draft', FUTURE_STORED_PUB_DATE, NOW)).toBe(true);
    expect(isDue('draft', PAST_STORED_PUB_DATE, NOW)).toBe(true);
  });

  it('ignores invalid publication dates', () => {
    expect(isScheduled('draft', 'tomorrow', NOW)).toBe(false);
    expect(isDue('draft', 'tomorrow', NOW)).toBe(false);
    expect(isScheduled('draft', '2026-13-45', NOW)).toBe(false);
    expect(isDue('draft', '2026-13-45', NOW)).toBe(false);
  });

  it('ignores missing publication dates', () => {
    expect(isScheduled('draft', null, NOW)).toBe(false);
    expect(isDue('draft', null, NOW)).toBe(false);
    expect(isScheduled('draft', undefined, NOW)).toBe(false);
    expect(isDue('draft', undefined, NOW)).toBe(false);
    expect(isScheduled('draft', '', NOW)).toBe(false);
    expect(isDue('draft', '', NOW)).toBe(false);
  });

  it('never schedules a post that is not a draft', () => {
    expect(isScheduled('published', FUTURE_PUB_DATE, NOW)).toBe(false);
    expect(isScheduled('archived', FUTURE_PUB_DATE, NOW)).toBe(false);
  });
});

describe('isDue', () => {
  it('never marks a published post as due', () => {
    expect(isDue('published', PAST_PUB_DATE, NOW)).toBe(false);
    expect(isDue('published', FUTURE_PUB_DATE, NOW)).toBe(false);
  });

  it('never marks an archived post as due', () => {
    expect(isDue('archived', PAST_PUB_DATE, NOW)).toBe(false);
    expect(isDue('archived', FUTURE_PUB_DATE, NOW)).toBe(false);
  });
});

describe('listScheduledPosts', () => {
  it('maps drafts with a future publication date in ascending order', async () => {
    const { database } = createFakeDatabase({
      rows: [
        postRow('later', 'draft', '2026-10-14T09:00:00.000Z', 'Later post'),
        postRow('upcoming', 'draft', FUTURE_PUB_DATE, 'Upcoming post'),
        postRow('ready', 'draft', PAST_PUB_DATE, 'Ready post'),
        postRow('live', 'published', FUTURE_PUB_DATE, 'Live post'),
      ],
      updateChanges: [],
    });

    await expect(listScheduledPosts(database, NOW)).resolves.toEqual([
      { id: 'upcoming', title: 'Upcoming post', pubDate: FUTURE_PUB_DATE },
      { id: 'later', title: 'Later post', pubDate: '2026-10-14T09:00:00.000Z' },
    ]);
  });
});

describe('listDueScheduledPosts', () => {
  it('maps drafts whose publication date has arrived in ascending order', async () => {
    const { database } = createFakeDatabase({
      rows: [
        postRow('second', 'draft', '2026-10-11T11:00:00.000Z', 'Second post'),
        postRow('first', 'draft', PAST_PUB_DATE, 'First post'),
        postRow('upcoming', 'draft', FUTURE_PUB_DATE, 'Upcoming post'),
        postRow('gone', 'archived', PAST_PUB_DATE, 'Gone post'),
      ],
      updateChanges: [],
    });

    await expect(listDueScheduledPosts(database, NOW)).resolves.toEqual([
      { id: 'first', title: 'First post', pubDate: PAST_PUB_DATE },
      { id: 'second', title: 'Second post', pubDate: '2026-10-11T11:00:00.000Z' },
    ]);
  });
});

describe('publishDuePosts', () => {
  it('publishes due drafts in publication order with the guarded update', async () => {
    const { database, writeLog } = createFakeDatabase({
      rows: [
        postRow('second', 'draft', '2026-10-11T11:00:00.000Z', 'Second post'),
        postRow('first', 'draft', PAST_PUB_DATE, 'First post'),
      ],
      updateChanges: [1, 1],
    });

    const { published } = await publishDuePosts(database, NOW);

    expect(published).toEqual(['first', 'second']);

    const updates = writeLog.filter((write) => write.sql.includes('UPDATE posts'));
    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toContain("status = 'draft'");
    expect(updates[0].params).toEqual([NOW.toISOString(), 'first']);
    expect(updates[1].params).toEqual([NOW.toISOString(), 'second']);
  });

  it('does not count or record a post when the guarded update changes no rows', async () => {
    const { database, writeLog } = createFakeDatabase({
      rows: [postRow('raced', 'draft', PAST_PUB_DATE)],
      updateChanges: [0],
    });

    const { published } = await publishDuePosts(database, NOW);

    expect(published).toEqual([]);
    expect(writeLog.filter((write) => write.sql.includes('UPDATE posts'))).toHaveLength(1);
    expect(writeLog.some((write) => write.sql.includes('INSERT INTO activity'))).toBe(false);
  });

  it('records a scheduler activity entry for each published post', async () => {
    const { database, writeLog } = createFakeDatabase({
      rows: [
        postRow('first', 'draft', PAST_PUB_DATE, 'First post'),
        postRow('second', 'draft', '2026-10-11T11:00:00.000Z', 'Second post'),
      ],
      updateChanges: [1, 1],
    });

    await publishDuePosts(database, NOW);

    const actorWrites = writeLog.filter((write) => write.sql.includes('INSERT INTO actors'));
    expect(actorWrites).toHaveLength(2);
    expect(actorWrites[0].params.slice(0, 3)).toEqual(['scheduler', 'agent', 'Scheduler']);

    const activityWrites = writeLog.filter((write) => write.sql.includes('INSERT INTO activity'));
    expect(activityWrites).toHaveLength(2);
    expect(activityWrites[0].params).toEqual([
      expect.any(String),
      'scheduler',
      'agent',
      'Scheduler',
      'post.published',
      'post',
      'first',
      'Published "First post" on schedule',
      expect.any(String),
    ]);
    expect(activityWrites[1].params).toEqual([
      expect.any(String),
      'scheduler',
      'agent',
      'Scheduler',
      'post.published',
      'post',
      'second',
      'Published "Second post" on schedule',
      expect.any(String),
    ]);
  });

  it('leaves posts alone when nothing is due yet', async () => {
    const { database, writeLog } = createFakeDatabase({
      rows: [postRow('upcoming', 'draft', FUTURE_PUB_DATE)],
      updateChanges: [1],
    });

    const { published } = await publishDuePosts(database, NOW);

    expect(published).toEqual([]);
    expect(writeLog).toEqual([]);
  });
});
