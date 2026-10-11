import { describe, expect, it } from 'vitest';
import { createD1Store, resolvePublishedAt } from './d1-store';

const NOW = '2026-10-11T12:00:00.000Z';
const FIRST_PUBLISHED_AT = '2026-10-01T08:00:00.000Z';

interface PostRowLike {
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
  affiliate: number;
  faq: string;
  pub_date: string | null;
  published_at: string | null;
  updated_date: string | null;
  updated_at: string;
}

interface FakeWrite {
  sql: string;
  params: unknown[];
}

function postRow(overrides: Partial<PostRowLike> = {}): PostRowLike {
  return {
    id: 'existing-post',
    title: 'Existing post',
    description: 'Existing description',
    seo_title: null,
    status: 'published',
    category: null,
    tags: '[]',
    body: '',
    cover_url: null,
    cover_alt: null,
    canonical: null,
    noindex: 0,
    focus_keyword: null,
    affiliate: 0,
    faq: '[]',
    pub_date: '2026-10-01T00:00:00.000Z',
    published_at: FIRST_PUBLISHED_AT,
    updated_date: null,
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeDatabase(row: PostRowLike): {
  database: D1Database;
  writeLog: FakeWrite[];
} {
  const writeLog: FakeWrite[] = [];

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all() {
          return { results: [] };
        },
        async first() {
          if (sql.includes('SELECT id FROM posts')) {
            return null;
          }
          if (sql.includes('SELECT * FROM posts')) {
            return row;
          }
          return null;
        },
        async run() {
          writeLog.push({ sql, params });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writeLog };
}

function findWrite(writeLog: FakeWrite[], marker: string): FakeWrite {
  const write = writeLog.find((entry) => entry.sql.includes(marker));
  if (!write) {
    throw new Error(`Expected a write containing "${marker}".`);
  }
  return write;
}

describe('resolvePublishedAt', () => {
  it('sets the timestamp when a draft transitions to published', () => {
    expect(resolvePublishedAt('draft', 'published', null, NOW)).toBe(NOW);
  });

  it('sets the timestamp when an archived post transitions to published', () => {
    expect(resolvePublishedAt('archived', 'published', null, NOW)).toBe(NOW);
  });

  it('does not move the timestamp when a published post stays published', () => {
    expect(resolvePublishedAt('published', 'published', FIRST_PUBLISHED_AT, NOW)).toBe(
      FIRST_PUBLISHED_AT,
    );
  });

  it('preserves the first publish timestamp when republishing after unpublish', () => {
    expect(resolvePublishedAt('draft', 'published', FIRST_PUBLISHED_AT, NOW)).toBe(
      FIRST_PUBLISHED_AT,
    );
  });

  it('keeps the timestamp when unpublishing', () => {
    expect(resolvePublishedAt('published', 'draft', FIRST_PUBLISHED_AT, NOW)).toBe(
      FIRST_PUBLISHED_AT,
    );
  });

  it('leaves the timestamp unset while a draft stays a draft', () => {
    expect(resolvePublishedAt('draft', 'draft', null, NOW)).toBeNull();
  });
});

describe('createPost published_at binding', () => {
  it('binds now when the inserted status is published', async () => {
    const { database, writeLog } = createFakeDatabase(postRow());
    const store = createD1Store(database);

    await store.createPost({
      slug: 'new-published-post',
      data: { title: 'New published post', description: 'Description', status: 'published' },
      body: '',
      message: 'feat(content): new published post',
    });

    const insert = findWrite(writeLog, 'INSERT INTO posts');
    expect(insert.sql).toContain('published_at');
    const publishedAt = insert.params.at(-3);
    expect(publishedAt).toBe(insert.params.at(-2));
    expect(new Date(String(publishedAt)).toISOString()).toBe(publishedAt);
  });

  it('binds null when the inserted status is not published', async () => {
    const { database, writeLog } = createFakeDatabase(postRow());
    const store = createD1Store(database);

    await store.createPost({
      slug: 'new-draft-post',
      data: { title: 'New draft post', description: 'Description', status: 'draft' },
      body: '',
      message: 'feat(content): new draft post',
    });

    const insert = findWrite(writeLog, 'INSERT INTO posts');
    expect(insert.params.at(-3)).toBeNull();
  });
});

describe('updatePost published_at binding', () => {
  it('does not move the timestamp when an already published post stays published', async () => {
    const { database, writeLog } = createFakeDatabase(postRow());
    const store = createD1Store(database);

    await store.updatePost('existing-post', {
      slug: 'existing-post',
      data: { title: 'Edited title', description: 'Edited description', status: 'published' },
      body: '',
      message: 'chore(content): edit existing post',
    });

    const update = findWrite(writeLog, 'UPDATE posts');
    expect(update.sql).toContain('published_at = ?');
    expect(update.params.at(-3)).toBe(FIRST_PUBLISHED_AT);
    expect(update.params.at(-1)).toBe('existing-post');
  });

  it('sets the timestamp when a draft transitions to published', async () => {
    const { database, writeLog } = createFakeDatabase(
      postRow({ status: 'draft', published_at: null }),
    );
    const store = createD1Store(database);

    await store.updatePost('existing-post', {
      slug: 'existing-post',
      data: { title: 'Edited title', description: 'Edited description', status: 'published' },
      body: '',
      message: 'feat(content): publish existing post',
    });

    const update = findWrite(writeLog, 'UPDATE posts');
    const publishedAt = update.params.at(-3);
    expect(publishedAt).toBe(update.params.at(-2));
    expect(new Date(String(publishedAt)).toISOString()).toBe(publishedAt);
  });

  it('keeps the timestamp when unpublishing', async () => {
    const { database, writeLog } = createFakeDatabase(postRow());
    const store = createD1Store(database);

    await store.updatePost('existing-post', {
      slug: 'existing-post',
      data: { title: 'Edited title', description: 'Edited description', status: 'draft' },
      body: '',
      message: 'chore(content): unpublish existing post',
    });

    const update = findWrite(writeLog, 'UPDATE posts');
    expect(update.params.at(-3)).toBe(FIRST_PUBLISHED_AT);
  });
});
