import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '../notifications/notify';
import {
  claimRevisionTarget,
  findRevisionTarget,
  MAX_REVISION_ROUNDS,
  parkExhaustedRevisions,
  REVISION_EXHAUSTED_STAGE,
} from './revision';

vi.mock('../notifications/notify', () => ({ notify: vi.fn() }));

interface RevisionPostRow {
  id: string;
  title: string;
  description: string;
  body: string;
  review_notes: string | null;
  revision_count: number;
  review_status: string;
  review_stage: string | null;
}

function revisionPostRow(overrides: Partial<RevisionPostRow> = {}): RevisionPostRow {
  return {
    id: 'draft-1',
    title: 'How far should a monitor sit from your eyes',
    description: 'The reach and angle numbers that matter.',
    body: 'Body',
    review_notes: 'Tighten the quick answer.',
    revision_count: 0,
    review_status: 'changes_requested',
    review_stage: null,
    ...overrides,
  };
}

function readRevisionLimit(params: readonly unknown[]): number {
  return params.find((value): value is number => typeof value === 'number') ?? 0;
}

function applyRevisionWrite(rows: RevisionPostRow[], sql: string, params: unknown[]): number {
  if (sql.includes('revision_count = revision_count + 1')) {
    const id = String(params[1]);
    const limit = readRevisionLimit(params);
    const row = rows.find((candidate) => candidate.id === id);
    const changes =
      row && row.review_status === 'changes_requested' && row.revision_count < limit ? 1 : 0;

    if (row && changes === 1) {
      row.review_status = 'pending';
      row.revision_count += 1;
    }

    return changes;
  }

  const stage = String(params[0]);
  const id = String(params[2]);
  const limit = readRevisionLimit(params);
  const row = rows.find((candidate) => candidate.id === id);
  const changes =
    row &&
    row.review_status === 'changes_requested' &&
    row.revision_count >= limit &&
    row.review_stage !== stage
      ? 1
      : 0;

  if (row && changes === 1) {
    row.review_stage = stage;
  }

  return changes;
}

function createRevisionDatabase(rows: RevisionPostRow[]): D1Database {
  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          const limit = readRevisionLimit(params);
          const row = rows.find(
            (candidate) =>
              candidate.review_status === 'changes_requested' && candidate.revision_count < limit,
          );

          return row ? { ...row } : null;
        },
        async all() {
          const limit = readRevisionLimit(params);
          const stage = REVISION_EXHAUSTED_STAGE;

          return {
            results: rows.filter(
              (candidate) =>
                candidate.review_status === 'changes_requested' &&
                candidate.revision_count >= limit &&
                candidate.review_stage !== stage,
            ),
          };
        },
        async run() {
          return { meta: { changes: applyRevisionWrite(rows, sql, params) } };
        },
      };

      return statement;
    },
  };

  return database as unknown as D1Database;
}

describe('revision ceiling', () => {
  it('defaults to three automatic revision rounds', () => {
    expect(MAX_REVISION_ROUNDS).toBe(3);
  });

  it('returns a draft one revision below the ceiling', async () => {
    const row = revisionPostRow({ revision_count: MAX_REVISION_ROUNDS - 1 });
    const database = createRevisionDatabase([row]);

    const target = await findRevisionTarget(database);

    expect(target).toEqual({
      id: row.id,
      title: row.title,
      description: row.description,
      body: row.body,
      reviewNotes: row.review_notes,
      revisionCount: MAX_REVISION_ROUNDS - 1,
    });
  });

  it('stops returning a draft at the ceiling', async () => {
    const database = createRevisionDatabase([
      revisionPostRow({ revision_count: MAX_REVISION_ROUNDS }),
    ]);

    expect(await findRevisionTarget(database)).toBeNull();
  });

  it('stops returning a draft above the ceiling', async () => {
    const database = createRevisionDatabase([
      revisionPostRow({ revision_count: MAX_REVISION_ROUNDS + 1 }),
    ]);

    expect(await findRevisionTarget(database)).toBeNull();
  });

  it('claims the last allowed revision and refuses the next claim', async () => {
    const row = revisionPostRow({ revision_count: MAX_REVISION_ROUNDS - 1 });
    const database = createRevisionDatabase([row]);

    expect(await claimRevisionTarget(database, row.id)).toBe(true);
    expect(row.revision_count).toBe(MAX_REVISION_ROUNDS);
    expect(await claimRevisionTarget(database, row.id)).toBe(false);
  });
});

describe('parkExhaustedRevisions', () => {
  beforeEach(() => {
    vi.mocked(notify).mockClear();
  });

  it('parks a draft at the ceiling and asks a human once', async () => {
    const row = revisionPostRow({ revision_count: MAX_REVISION_ROUNDS });
    const database = createRevisionDatabase([row]);

    const parked = await parkExhaustedRevisions(database);

    expect(parked).toEqual([{ id: row.id, title: row.title, revisionCount: MAX_REVISION_ROUNDS }]);
    expect(row.review_stage).toBe(REVISION_EXHAUSTED_STAGE);
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify)).toHaveBeenCalledWith({
      event: 'post.revision.exhausted',
      title: `"${row.title}" needs a human decision`,
      body: expect.stringContaining('The writer will not revise this draft again.'),
      link: `/dashboard/posts/${row.id}/edit`,
      metadata: {
        postId: row.id,
        revisionCount: MAX_REVISION_ROUNDS,
        limit: MAX_REVISION_ROUNDS,
      },
      dedupeSubject: row.id,
    });
  });

  it('does not notify again on a second sweep of the same draft', async () => {
    const row = revisionPostRow({ revision_count: MAX_REVISION_ROUNDS });
    const database = createRevisionDatabase([row]);

    await parkExhaustedRevisions(database);
    const secondSweep = await parkExhaustedRevisions(database);

    expect(secondSweep).toEqual([]);
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
  });

  it('leaves a draft below the ceiling for the writer', async () => {
    const row = revisionPostRow({ revision_count: MAX_REVISION_ROUNDS - 1 });
    const database = createRevisionDatabase([row]);

    const parked = await parkExhaustedRevisions(database);

    expect(parked).toEqual([]);
    expect(row.review_stage).toBeNull();
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it('ignores a draft the writer already claimed for revision', async () => {
    const row = revisionPostRow({
      revision_count: MAX_REVISION_ROUNDS,
      review_status: 'pending',
    });
    const database = createRevisionDatabase([row]);

    const parked = await parkExhaustedRevisions(database);

    expect(parked).toEqual([]);
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });
});
