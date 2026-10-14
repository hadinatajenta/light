import { notify } from '../notifications/notify';

export const MAX_REVISION_ROUNDS = 3;

export const REVISION_EXHAUSTED_STAGE = 'revision_exhausted';

export interface RevisionTarget {
  id: string;
  title: string;
  description: string;
  body: string;
  reviewNotes: string;
  revisionCount: number;
}

interface RevisionRow {
  id: string;
  title: string;
  description: string;
  body: string;
  review_notes: string | null;
  revision_count: number;
}

export async function findRevisionTarget(db: D1Database): Promise<RevisionTarget | null> {
  const row = await db
    .prepare(
      `SELECT id, title, description, body, review_notes, revision_count FROM posts
       WHERE status = 'draft' AND review_status = 'changes_requested' AND revision_count < ?
       ORDER BY updated_at ASC LIMIT 1`,
    )
    .bind(MAX_REVISION_ROUNDS)
    .first<RevisionRow>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body,
    reviewNotes: row.review_notes ?? '',
    revisionCount: row.revision_count,
  };
}

export async function claimRevisionTarget(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE posts SET review_status = 'pending', revision_count = revision_count + 1, updated_at = ?
       WHERE id = ? AND status = 'draft' AND review_status = 'changes_requested' AND revision_count < ?`,
    )
    .bind(new Date().toISOString(), id, MAX_REVISION_ROUNDS)
    .run();

  return result.meta.changes === 1;
}

export interface ExhaustedRevisionTarget {
  id: string;
  title: string;
  revisionCount: number;
}

interface ExhaustedRevisionRow {
  id: string;
  title: string;
  revision_count: number;
}

async function markRevisionExhausted(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE posts SET review_stage = ?, updated_at = ?
       WHERE id = ? AND status = 'draft' AND review_status = 'changes_requested'
         AND revision_count >= ? AND COALESCE(review_stage, '') <> ?`,
    )
    .bind(
      REVISION_EXHAUSTED_STAGE,
      new Date().toISOString(),
      id,
      MAX_REVISION_ROUNDS,
      REVISION_EXHAUSTED_STAGE,
    )
    .run();

  return result.meta.changes === 1;
}

export async function parkExhaustedRevisions(db: D1Database): Promise<ExhaustedRevisionTarget[]> {
  const result = await db
    .prepare(
      `SELECT id, title, revision_count FROM posts
       WHERE status = 'draft' AND review_status = 'changes_requested'
         AND revision_count >= ? AND COALESCE(review_stage, '') <> ?
       ORDER BY updated_at ASC`,
    )
    .bind(MAX_REVISION_ROUNDS, REVISION_EXHAUSTED_STAGE)
    .all<ExhaustedRevisionRow>();

  const parked: ExhaustedRevisionTarget[] = [];

  for (const row of result.results ?? []) {
    if (!(await markRevisionExhausted(db, row.id))) {
      continue;
    }

    const target: ExhaustedRevisionTarget = {
      id: row.id,
      title: row.title,
      revisionCount: row.revision_count,
    };

    parked.push(target);

    await notify({
      event: 'post.revision.exhausted',
      title: `"${target.title}" needs a human decision`,
      body: `The reviewer still requests changes after ${target.revisionCount} automatic revisions, which reaches the limit of ${MAX_REVISION_ROUNDS}. The writer will not revise this draft again. Open it to finish it by hand or archive it.`,
      link: `/dashboard/posts/${target.id}/edit`,
      metadata: {
        postId: target.id,
        revisionCount: target.revisionCount,
        limit: MAX_REVISION_ROUNDS,
      },
      dedupeSubject: target.id,
    });
  }

  return parked;
}

export async function saveReviewNotes(db: D1Database, id: string, notes: string): Promise<void> {
  await db
    .prepare('UPDATE posts SET review_notes = ?, updated_at = ? WHERE id = ?')
    .bind(notes.slice(0, 4000), new Date().toISOString(), id)
    .run();
}

export async function replaceDraftBody(
  db: D1Database,
  id: string,
  input: { title?: string; description?: string; body: string },
): Promise<void> {
  const assignments = ['body = ?', 'updated_at = ?'];
  const bindings: unknown[] = [input.body, new Date().toISOString()];

  if (input.title) {
    assignments.unshift('title = ?');
    bindings.unshift(input.title);
  }

  if (input.description) {
    assignments.unshift('description = ?');
    bindings.unshift(input.description);
  }

  bindings.push(id);

  await db
    .prepare(`UPDATE posts SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();
}
