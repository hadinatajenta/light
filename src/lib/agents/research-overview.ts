import { type BudgetState, readBudgetState } from './budget';
import { countTopics, TOPIC_STATUSES, type TopicStatus } from './topics';

const TOPIC_LIMIT = 200;
const NOTE_LIMIT = 200;
const RUN_LIMIT = 12;
const RUN_OUTPUT_LIMIT = 6000;
const SCRAPPER_ROLE = 'scrapper';

export interface ResearchCounts {
  queued: number;
  fetched: number;
  researched: number;
  inProgress: number;
  used: number;
  blocked: number;
  dead: number;
}

export interface ResearchTopic {
  id: string;
  title: string;
  status: TopicStatus;
  category: string | null;
  verifiedNotes: number;
  unverifiedNotes: number;
  gaps: number;
  updatedAt: string;
}

export interface ResearchNote {
  id: string;
  topicId: string;
  topicTitle: string;
  kind: string;
  heading: string;
  detail: string;
  url: string | null;
  quote: string | null;
  verified: boolean;
  sourceType: string | null;
  angle: string | null;
  createdAt: string;
}

export interface ResearchRun {
  id: string;
  status: string;
  summary: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  startedAt: string;
  finishedAt: string | null;
  output: string | null;
}

export interface ResearchOverview {
  counts: ResearchCounts;
  topics: ResearchTopic[];
  notes: ResearchNote[];
  runs: ResearchRun[];
  usage: BudgetState;
}

interface TopicAggregateRow {
  id: string;
  title: string;
  status: string;
  category: string | null;
  verified_notes: number;
  unverified_notes: number;
  gaps: number;
  updated_at: string;
}

interface NoteRow {
  id: string;
  topic_id: string;
  topic_title: string;
  kind: string;
  heading: string;
  detail: string;
  url: string | null;
  quote: string | null;
  verified: number;
  source_type: string | null;
  angle: string | null;
  created_at: string;
}

interface RunRow {
  id: string;
  status: string;
  summary: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  started_at: string;
  finished_at: string | null;
  output: string | null;
}

function readStatus(value: string): TopicStatus {
  return (TOPIC_STATUSES as readonly string[]).includes(value) ? (value as TopicStatus) : 'queued';
}

export function truncateRunOutput(output: string | null, limit = RUN_OUTPUT_LIMIT): string | null {
  if (!output) {
    return null;
  }

  return output.length <= limit ? output : output.slice(0, limit);
}

export async function loadResearchOverview(db: D1Database): Promise<ResearchOverview> {
  const [counts, topicRows, noteRows, runRows, usage] = await Promise.all([
    countTopics(db),
    db
      .prepare(
        `SELECT
           t.id AS id,
           t.title AS title,
           t.status AS status,
           t.category AS category,
           COALESCE(SUM(CASE WHEN s.verified = 1 AND s.kind <> 'gap' THEN 1 ELSE 0 END), 0) AS verified_notes,
           COALESCE(SUM(CASE WHEN s.verified = 0 AND s.kind <> 'gap' THEN 1 ELSE 0 END), 0) AS unverified_notes,
           COALESCE(SUM(CASE WHEN s.kind = 'gap' THEN 1 ELSE 0 END), 0) AS gaps,
           t.updated_at AS updated_at
         FROM topics t
         LEFT JOIN sources s ON s.topic_id = t.id
         GROUP BY t.id
         ORDER BY t.updated_at DESC
         LIMIT ?`,
      )
      .bind(TOPIC_LIMIT)
      .all<TopicAggregateRow>(),
    db
      .prepare(
        `SELECT
           s.id AS id,
           s.topic_id AS topic_id,
           t.title AS topic_title,
           s.kind AS kind,
           s.heading AS heading,
           s.detail AS detail,
           s.url AS url,
           s.quote AS quote,
           s.verified AS verified,
           s.source_type AS source_type,
           s.angle AS angle,
           s.created_at AS created_at
         FROM sources s
         JOIN topics t ON t.id = s.topic_id
         ORDER BY s.created_at DESC
         LIMIT ?`,
      )
      .bind(NOTE_LIMIT)
      .all<NoteRow>(),
    db
      .prepare(
        `SELECT
           ar.id AS id,
           ar.status AS status,
           ar.summary AS summary,
           ar.tokens_in AS tokens_in,
           ar.tokens_out AS tokens_out,
           ar.started_at AS started_at,
           ar.finished_at AS finished_at,
           ar.output AS output
         FROM agent_runs ar
         JOIN agents a ON a.id = ar.agent_id
         WHERE a.role = ?
         ORDER BY ar.started_at DESC
         LIMIT ?`,
      )
      .bind(SCRAPPER_ROLE, RUN_LIMIT)
      .all<RunRow>(),
    readBudgetState(db),
  ]);

  return {
    counts: {
      queued: counts.queued,
      fetched: counts.fetched,
      researched: counts.researched,
      inProgress: counts.inProgress,
      used: counts.used,
      blocked: counts.blocked,
      dead: counts.dead,
    },
    topics: (topicRows.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      status: readStatus(row.status),
      category: row.category,
      verifiedNotes: row.verified_notes,
      unverifiedNotes: row.unverified_notes,
      gaps: row.gaps,
      updatedAt: row.updated_at,
    })),
    notes: (noteRows.results ?? []).map((row) => ({
      id: row.id,
      topicId: row.topic_id,
      topicTitle: row.topic_title,
      kind: row.kind,
      heading: row.heading,
      detail: row.detail,
      url: row.url,
      quote: row.quote,
      verified: row.verified === 1,
      sourceType: row.source_type,
      angle: row.angle,
      createdAt: row.created_at,
    })),
    runs: (runRows.results ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      summary: row.summary,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      output: truncateRunOutput(row.output),
    })),
    usage,
  };
}
