import { ApiError } from '../errors';

export const SOURCE_KINDS = ['note', 'spec', 'claim', 'source'] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceRecord {
  id: string;
  topicId: string;
  agentId: string | null;
  kind: SourceKind;
  heading: string;
  detail: string;
  reference: string | null;
  createdAt: string;
}

export interface SourceInput {
  topicId: string;
  agentId: string | null;
  kind: SourceKind;
  heading: string;
  detail: string;
  reference: string | null;
}

interface SourceRow {
  id: string;
  topic_id: string;
  agent_id: string | null;
  kind: string;
  heading: string;
  detail: string;
  reference: string | null;
  created_at: string;
}

function readKind(value: string): SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(value) ? (value as SourceKind) : 'note';
}

function toSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    agentId: row.agent_id,
    kind: readKind(row.kind),
    heading: row.heading,
    detail: row.detail,
    reference: row.reference,
    createdAt: row.created_at,
  };
}

export async function listSources(db: D1Database, topicId: string): Promise<SourceRecord[]> {
  const result = await db
    .prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at ASC')
    .bind(topicId)
    .all<SourceRow>();

  return (result.results ?? []).map(toSource);
}

export async function createSource(db: D1Database, input: SourceInput): Promise<SourceRecord> {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO sources (id, topic_id, agent_id, kind, heading, detail, reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.topicId,
      input.agentId,
      input.kind,
      input.heading,
      input.detail,
      input.reference,
      new Date().toISOString(),
    )
    .run();

  const row = await db.prepare('SELECT * FROM sources WHERE id = ?').bind(id).first<SourceRow>();
  if (!row) {
    throw new ApiError(500, 'SOURCE_WRITE_FAILED', 'The research note could not be saved.');
  }

  return toSource(row);
}

export async function deleteSource(db: D1Database, id: string): Promise<void> {
  const row = await db.prepare('SELECT id FROM sources WHERE id = ?').bind(id).first();
  if (!row) {
    throw new ApiError(404, 'SOURCE_NOT_FOUND', 'That research note does not exist.');
  }

  await db.prepare('DELETE FROM sources WHERE id = ?').bind(id).run();
}

export function renderSourcesForPrompt(sources: SourceRecord[], limit = 20): string {
  if (sources.length === 0) {
    return '';
  }

  return sources
    .slice(0, limit)
    .map((source) => {
      const reference = source.reference ? ` (source: ${source.reference})` : '';
      return `- [${source.kind}] ${source.heading}: ${source.detail}${reference}`;
    })
    .join('\n');
}
