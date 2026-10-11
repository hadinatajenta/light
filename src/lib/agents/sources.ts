import { ApiError } from '../errors';

export const SOURCE_KINDS = ['note', 'spec', 'claim', 'source', 'gap'] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceRecord {
  id: string;
  topicId: string;
  agentId: string | null;
  kind: SourceKind;
  heading: string;
  detail: string;
  reference: string | null;
  url: string | null;
  quote: string | null;
  verified: boolean;
  accessedAt: string | null;
  sourceType: string | null;
  angle: string | null;
  createdAt: string;
}

export interface SourceInput {
  topicId: string;
  agentId: string | null;
  kind: SourceKind;
  heading: string;
  detail: string;
  reference: string | null;
  url?: string | null;
  quote?: string | null;
  verified?: boolean;
  accessedAt?: string | null;
  sourceType?: string | null;
  angle?: string | null;
}

interface SourceRow {
  id: string;
  topic_id: string;
  agent_id: string | null;
  kind: string;
  heading: string;
  detail: string;
  reference: string | null;
  url: string | null;
  quote: string | null;
  verified: number;
  accessed_at: string | null;
  source_type: string | null;
  angle: string | null;
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
    url: row.url,
    quote: row.quote,
    verified: row.verified === 1,
    accessedAt: row.accessed_at,
    sourceType: row.source_type,
    angle: row.angle,
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

export async function listVerifiedSources(
  db: D1Database,
  topicId: string,
): Promise<SourceRecord[]> {
  const result = await db
    .prepare(
      "SELECT * FROM sources WHERE topic_id = ? AND (verified = 1 OR kind = 'gap') ORDER BY created_at ASC",
    )
    .bind(topicId)
    .all<SourceRow>();

  return (result.results ?? []).map(toSource);
}

export async function hasVerifiedSources(db: D1Database, topicId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM sources WHERE topic_id = ? AND verified = 1 AND kind <> 'gap' LIMIT 1")
    .bind(topicId)
    .first();

  return Boolean(row);
}

export async function postPassesResearchGate(db: D1Database, postId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT
         EXISTS(SELECT 1 FROM topics WHERE used_post_id = ?) AS linked,
         EXISTS(
           SELECT 1 FROM sources s
           JOIN topics t ON t.id = s.topic_id
           WHERE t.used_post_id = ? AND s.verified = 1 AND s.kind <> 'gap'
         ) AS verified`,
    )
    .bind(postId, postId)
    .first<{ linked: number; verified: number }>();

  if (!row || row.linked === 0) {
    return true;
  }

  return row.verified === 1;
}

export async function createSource(db: D1Database, input: SourceInput): Promise<SourceRecord> {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO sources
         (id, topic_id, agent_id, kind, heading, detail, reference, url, quote, verified, accessed_at, source_type, angle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.topicId,
      input.agentId,
      input.kind,
      input.heading,
      input.detail,
      input.reference,
      input.url ?? null,
      input.quote ?? null,
      input.verified === false ? 0 : 1,
      input.accessedAt ?? null,
      input.sourceType ?? null,
      input.angle ?? null,
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
      const metadata = [
        source.sourceType ? `type: ${source.sourceType}` : null,
        source.angle ? `angle: ${source.angle}` : null,
      ].filter((entry): entry is string => entry !== null);
      const summary = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
      const citation = source.url ?? source.reference;
      const reference = citation ? ` (source: ${citation})` : '';
      const quote = source.quote ? `\n  Quoted: "${source.quote}"` : '';
      return `- [${source.kind}] ${source.heading}${summary}: ${source.detail}${reference}${quote}`;
    })
    .join('\n');
}
