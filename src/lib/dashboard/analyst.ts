import type { AnalystConfig } from '../agents/analyst/config';
import { readAnalystConfig } from '../agents/analyst/config';
import type { AnalystFindingRecord, AnalystFindingStatus } from '../agents/analyst/findings';
import { ANALYST_FINDING_STATUSES, resolveFinding } from '../agents/analyst/findings';
import type {
  AnalystSource,
  AnalystSourceState,
  AnalystSourceStatus,
} from '../agents/analyst/sources';
import { ANALYST_SOURCES } from '../agents/analyst/sources';
import type { AgentRecord, AgentRunRecord } from '../agents/store';
import { findAgent, listAgentRuns, SYSTEM_ANALYST_AGENT_ID } from '../agents/store';
import { ApiError } from '../errors';

export const ANALYST_FINDING_PAGE_DEFAULT = 25;
export const ANALYST_FINDING_PAGE_MAX = 100;
export const ANALYST_FINDING_NOTE_MAX_LENGTH = 280;
export const ANALYST_DISMISSAL_WINDOW_DAYS = 30;

export type AnalystSourceViewState = AnalystSourceState | 'unknown';

export interface AnalystSourceStatusRecord extends AnalystSourceStatus {
  checkedAt: string;
}

export interface AnalystSourceView {
  source: AnalystSource;
  status: AnalystSourceViewState;
  detail: string;
  remediation: string;
  rowCount: number;
  checkedAt: string | null;
}

export interface AnalystDashboardState {
  agent: AgentRecord | null;
  config: AnalystConfig;
  sources: AnalystSourceView[];
  lastRun: AgentRunRecord | null;
}

export interface AnalystFindingFilter {
  status?: AnalystFindingStatus;
  rule?: string;
}

export interface AnalystFindingCounts {
  total: number;
  byStatus: Record<AnalystFindingStatus, number>;
  byRule: Record<string, number>;
}

export interface AnalystFindingPage {
  findings: AnalystFindingRecord[];
  totals: AnalystFindingCounts;
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

interface AnalystFindingRow {
  id: string;
  run_id: string;
  agent_id: string;
  rule_id: string;
  finding_key: string;
  subject_type: string;
  subject_id: string;
  title: string;
  detail: string;
  action_type: string;
  action_effort: string;
  score: number;
  impact: number;
  confidence: number;
  prize_clicks: number;
  evidence: string;
  data_quality: string;
  window_start: string;
  window_end: string;
  baseline_start: string;
  baseline_end: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  missed_runs: number;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  dismissed_until: string | null;
  created_at: string;
  updated_at: string;
}

interface AnalystSourceStatusRow {
  source: string;
  status: string;
  detail: string;
  remediation: string;
  row_count: number;
  checked_at: string;
}

const UNCHECKED_SOURCE_DETAIL =
  'The analyst has not read this source yet, so there is nothing to report for it.';
const UNCHECKED_SOURCE_REMEDIATION =
  'Run the Performance Analyst once so every source records what it returned.';

const ANALYST_FINDING_TRANSITIONS: Record<AnalystFindingStatus, readonly AnalystFindingStatus[]> = {
  open: ['resolved', 'dismissed'],
  actioned: ['open', 'resolved', 'dismissed'],
  resolved: ['open', 'dismissed'],
  dismissed: ['open', 'resolved'],
  expired: ['dismissed'],
};

function readStatus(value: string): AnalystFindingStatus {
  return (ANALYST_FINDING_STATUSES as readonly string[]).includes(value)
    ? (value as AnalystFindingStatus)
    : 'open';
}

function readStoredSourceState(value: string): AnalystSourceState {
  if (value === 'ok' || value === 'missing' || value === 'error') {
    return value;
  }

  return 'error';
}

function readJsonObject(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toAnalystFinding(row: AnalystFindingRow): AnalystFindingRecord {
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    ruleId: row.rule_id,
    findingKey: row.finding_key,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    detail: row.detail,
    actionType: row.action_type,
    actionEffort: row.action_effort,
    score: row.score,
    impact: row.impact,
    confidence: row.confidence,
    prizeClicks: row.prize_clicks,
    evidence: readJsonObject(row.evidence),
    dataQuality: readJsonObject(row.data_quality),
    windowStart: row.window_start,
    windowEnd: row.window_end,
    baselineStart: row.baseline_start,
    baselineEnd: row.baseline_end,
    status: readStatus(row.status),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    seenCount: row.seen_count,
    missedRuns: row.missed_runs,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolutionNote: row.resolution_note,
    dismissedUntil: row.dismissed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFindingFilter(filter: AnalystFindingFilter): {
  clause: string;
  bindings: string[];
} {
  const conditions: string[] = [];
  const bindings: string[] = [];

  if (filter.status) {
    conditions.push('status = ?');
    bindings.push(filter.status);
  }

  if (filter.rule) {
    conditions.push('rule_id = ?');
    bindings.push(filter.rule);
  }

  return {
    clause: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
    bindings,
  };
}

export function canApplyAnalystFindingStatus(
  from: AnalystFindingStatus,
  to: AnalystFindingStatus,
): boolean {
  return ANALYST_FINDING_TRANSITIONS[from].includes(to);
}

export function mergeAnalystSourceStatuses(
  rows: readonly AnalystSourceStatusRecord[],
  sources: readonly AnalystSource[] = ANALYST_SOURCES,
): AnalystSourceView[] {
  const latest = new Map<AnalystSource, AnalystSourceStatusRecord>();

  for (const row of rows) {
    latest.set(row.source, row);
  }

  return sources.map((source) => {
    const row = latest.get(source);

    if (!row) {
      return {
        source,
        status: 'unknown',
        detail: UNCHECKED_SOURCE_DETAIL,
        remediation: UNCHECKED_SOURCE_REMEDIATION,
        rowCount: 0,
        checkedAt: null,
      } satisfies AnalystSourceView;
    }

    return {
      source,
      status: row.status,
      detail: row.detail,
      remediation: row.remediation,
      rowCount: row.rowCount,
      checkedAt: row.checkedAt,
    };
  });
}

async function listAnalystSourceStatuses(db: D1Database): Promise<AnalystSourceStatusRecord[]> {
  const result = await db
    .prepare(
      `SELECT source, status, detail, remediation, row_count, checked_at
       FROM analyst_source_status current
       WHERE current.checked_at = (
         SELECT MAX(checked_at) FROM analyst_source_status WHERE source = current.source
       )`,
    )
    .all<AnalystSourceStatusRow>();

  return (result.results ?? []).map((row) => ({
    source: row.source as AnalystSource,
    status: readStoredSourceState(row.status),
    detail: row.detail,
    remediation: row.remediation,
    rowCount: row.row_count,
    checkedAt: row.checked_at,
  }));
}

export async function findAnalystFinding(
  db: D1Database,
  findingId: string,
): Promise<AnalystFindingRecord | null> {
  const row = await db
    .prepare('SELECT * FROM analyst_findings WHERE id = ?')
    .bind(findingId)
    .first<AnalystFindingRow>();

  return row ? toAnalystFinding(row) : null;
}

export async function listAnalystFindings(
  db: D1Database,
  filter: AnalystFindingFilter & { limit: number; offset: number },
): Promise<{ findings: AnalystFindingRecord[]; total: number }> {
  const { clause, bindings } = buildFindingFilter(filter);
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM analyst_findings${clause} ORDER BY score DESC, last_seen_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, filter.limit, filter.offset)
      .all<AnalystFindingRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM analyst_findings${clause}`)
      .bind(...bindings)
      .first<{ total: number }>(),
  ]);

  return {
    findings: (rows.results ?? []).map(toAnalystFinding),
    total: total?.total ?? 0,
  };
}

export async function countAnalystFindingsByStatus(
  db: D1Database,
): Promise<Record<AnalystFindingStatus, number>> {
  const result = await db
    .prepare('SELECT status, COUNT(*) AS total FROM analyst_findings GROUP BY status')
    .all<{ status: string; total: number }>();

  const counts = Object.fromEntries(
    ANALYST_FINDING_STATUSES.map((status) => [status, 0]),
  ) as Record<AnalystFindingStatus, number>;

  for (const row of result.results ?? []) {
    counts[readStatus(row.status)] = row.total;
  }

  return counts;
}

export async function countAnalystFindingsByRule(db: D1Database): Promise<Record<string, number>> {
  const result = await db
    .prepare('SELECT rule_id, COUNT(*) AS total FROM analyst_findings GROUP BY rule_id')
    .all<{ rule_id: string; total: number }>();

  const counts: Record<string, number> = {};

  for (const row of result.results ?? []) {
    counts[row.rule_id] = row.total;
  }

  return counts;
}

export async function loadAnalystFindingPage(
  db: D1Database,
  filter: AnalystFindingFilter & { limit: number; offset: number },
): Promise<AnalystFindingPage> {
  const [listed, byStatus, byRule] = await Promise.all([
    listAnalystFindings(db, filter),
    countAnalystFindingsByStatus(db),
    countAnalystFindingsByRule(db),
  ]);

  return {
    findings: listed.findings,
    totals: {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
      byRule,
    },
    page: {
      limit: filter.limit,
      offset: filter.offset,
      total: listed.total,
      hasMore: filter.offset + listed.findings.length < listed.total,
    },
  };
}

export async function loadAnalystDashboard(db: D1Database): Promise<AnalystDashboardState> {
  const agent = await findAgent(db, SYSTEM_ANALYST_AGENT_ID);
  const [config, sourceRows, runs] = await Promise.all([
    readAnalystConfig(db),
    listAnalystSourceStatuses(db),
    agent ? listAgentRuns(db, agent.id, 1) : Promise.resolve([]),
  ]);

  return {
    agent,
    config,
    sources: mergeAnalystSourceStatuses(sourceRows),
    lastRun: runs[0] ?? null,
  };
}

async function dismissAnalystFinding(
  db: D1Database,
  findingId: string,
  actor: string,
  note: string | null,
  nowIso: string,
): Promise<void> {
  const dismissedUntil = new Date(
    new Date(nowIso).getTime() + ANALYST_DISMISSAL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'dismissed', dismissed_until = ?, resolved_by = ?, resolution_note = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(dismissedUntil, actor, note, nowIso, findingId)
    .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

  if (changed !== 1) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }
}

async function reopenAnalystFinding(
  db: D1Database,
  findingId: string,
  actor: string,
  note: string | null,
  nowIso: string,
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'open', resolved_at = NULL, resolved_by = ?, resolution_note = ?,
           dismissed_until = NULL, missed_runs = 0, updated_at = ?
       WHERE id = ?`,
    )
    .bind(actor, note, nowIso, findingId)
    .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

  if (changed !== 1) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }
}

export async function applyAnalystFindingStatus(
  db: D1Database,
  findingId: string,
  target: AnalystFindingStatus,
  actor: string,
  note: string | null,
  now: Date = new Date(),
): Promise<AnalystFindingRecord> {
  const existing = await findAnalystFinding(db, findingId);

  if (!existing) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }

  if (existing.status === target) {
    throw new ApiError(409, 'FINDING_TRANSITION_NOT_ALLOWED', `This finding is already ${target}.`);
  }

  if (!canApplyAnalystFindingStatus(existing.status, target)) {
    throw new ApiError(
      409,
      'FINDING_TRANSITION_NOT_ALLOWED',
      `A ${existing.status} finding cannot become ${target}.`,
    );
  }

  const nowIso = now.toISOString();

  if (target === 'resolved') {
    await resolveFinding(db, findingId, actor, note, now);
  } else if (target === 'dismissed') {
    await dismissAnalystFinding(db, findingId, actor, note, nowIso);
  } else {
    await reopenAnalystFinding(db, findingId, actor, note, nowIso);
  }

  const updated = await findAnalystFinding(db, findingId);

  if (!updated) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }

  return updated;
}
