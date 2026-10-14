import { ApiError } from '../../errors';
import type { AnalystCandidate } from './rules';
import { findingMapKey } from './rules';
import type { AnalystSource, AnalystSourceStatus } from './sources';
import type { AnalystWindow } from './window';

export const ANALYST_FINDING_STATUSES = [
  'open',
  'actioned',
  'resolved',
  'dismissed',
  'expired',
] as const;

export type AnalystFindingStatus = (typeof ANALYST_FINDING_STATUSES)[number];

export const ANALYST_FINDING_MISS_LIMIT = 3;

export type FindingUpsertAction = 'insert' | 'refresh' | 'refresh-actioned' | 'refresh-dismissed';

export interface AnalystFindingRecord {
  id: string;
  runId: string;
  agentId: string;
  ruleId: string;
  findingKey: string;
  subjectType: string;
  subjectId: string;
  title: string;
  detail: string;
  actionType: string;
  actionEffort: string;
  score: number;
  impact: number;
  confidence: number;
  prizeClicks: number;
  evidence: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  status: AnalystFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  missedRuns: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  dismissedUntil: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface FindingWriteContext {
  runId: string;
  agentId: string;
  window: AnalystWindow;
  nowIso: string;
  newId: string;
}

export interface FindingWriteValues {
  id: string;
  runId: string;
  agentId: string;
  ruleId: string;
  findingKey: string;
  subjectType: string;
  subjectId: string;
  title: string;
  detail: string;
  actionType: string;
  actionEffort: string;
  score: number;
  impact: number;
  confidence: number;
  prizeClicks: number;
  evidence: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  status: AnalystFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  missedRuns: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  dismissedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedFindingWrite {
  action: FindingUpsertAction;
  values: FindingWriteValues;
}

export interface FindingPersistResult {
  inserted: number;
  refreshed: number;
  preserved: number;
  expired: number;
  resolved: number;
}

function readStatus(value: string): AnalystFindingStatus {
  return (ANALYST_FINDING_STATUSES as readonly string[]).includes(value)
    ? (value as AnalystFindingStatus)
    : 'open';
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

function toFinding(row: AnalystFindingRow): AnalystFindingRecord {
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

export function decideFindingUpsert(
  existing: Pick<AnalystFindingRecord, 'status' | 'dismissedUntil'> | null,
  nowIso: string,
): FindingUpsertAction {
  if (!existing) {
    return 'insert';
  }

  if (existing.status === 'actioned') {
    return 'refresh-actioned';
  }

  if (
    existing.status === 'dismissed' &&
    existing.dismissedUntil !== null &&
    existing.dismissedUntil > nowIso
  ) {
    return 'refresh-dismissed';
  }

  return 'refresh';
}

export function planFindingWrite(
  existing: AnalystFindingRecord | null,
  candidate: AnalystCandidate,
  context: FindingWriteContext,
): PlannedFindingWrite {
  const action = decideFindingUpsert(existing, context.nowIso);
  const base = {
    id: existing?.id ?? context.newId,
    runId: context.runId,
    agentId: context.agentId,
    ruleId: candidate.ruleId,
    findingKey: candidate.findingKey,
    subjectType: candidate.subjectType,
    subjectId: candidate.subjectId,
    title: candidate.title,
    detail: candidate.detail,
    actionType: candidate.actionType,
    actionEffort: candidate.actionEffort,
    score: candidate.score,
    impact: candidate.impact,
    confidence: candidate.confidence,
    prizeClicks: candidate.prizeClicks,
    evidence: candidate.evidence,
    dataQuality: candidate.dataQuality,
    windowStart: context.window.start,
    windowEnd: context.window.end,
    baselineStart: context.window.baselineStart,
    baselineEnd: context.window.baselineEnd,
    lastSeenAt: context.nowIso,
    seenCount: (existing?.seenCount ?? 0) + 1,
    missedRuns: 0,
    updatedAt: context.nowIso,
  };

  if (!existing || action === 'refresh') {
    return {
      action,
      values: {
        ...base,
        status: 'open',
        firstSeenAt: existing?.firstSeenAt ?? context.nowIso,
        createdAt: existing?.createdAt ?? context.nowIso,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        dismissedUntil: null,
      },
    };
  }

  const status: AnalystFindingStatus = action === 'refresh-actioned' ? 'actioned' : 'dismissed';

  return {
    action,
    values: {
      ...base,
      status,
      firstSeenAt: existing.firstSeenAt,
      createdAt: existing.createdAt,
      resolvedAt: existing.resolvedAt,
      resolvedBy: existing.resolvedBy,
      resolutionNote: existing.resolutionNote,
      dismissedUntil: existing.dismissedUntil,
    },
  };
}

export interface PlannedFindingMiss {
  missedRuns: number;
  expire: boolean;
}

export function planFindingMiss(missedRuns: number): PlannedFindingMiss {
  const next = Math.max(missedRuns, 0) + 1;

  return { missedRuns: next, expire: next >= ANALYST_FINDING_MISS_LIMIT };
}

export function analystFindingExpiryNote(): string {
  return `No longer detected in ${ANALYST_FINDING_MISS_LIMIT} consecutive runs.`;
}

async function writeFinding(db: D1Database, values: FindingWriteValues): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analyst_findings (id, run_id, agent_id, rule_id, finding_key, subject_type,
        subject_id, title, detail, action_type, action_effort, score, impact, confidence, prize_clicks,
        evidence, data_quality, window_start, window_end, baseline_start, baseline_end, status,
        first_seen_at, last_seen_at, seen_count, missed_runs, resolved_at, resolved_by,
        resolution_note, dismissed_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(rule_id, finding_key) DO UPDATE SET
         run_id = excluded.run_id,
         agent_id = excluded.agent_id,
         subject_type = excluded.subject_type,
         subject_id = excluded.subject_id,
         title = excluded.title,
         detail = excluded.detail,
         action_type = excluded.action_type,
         action_effort = excluded.action_effort,
         score = excluded.score,
         impact = excluded.impact,
         confidence = excluded.confidence,
         prize_clicks = excluded.prize_clicks,
         evidence = excluded.evidence,
         data_quality = excluded.data_quality,
         window_start = excluded.window_start,
         window_end = excluded.window_end,
         baseline_start = excluded.baseline_start,
         baseline_end = excluded.baseline_end,
         status = excluded.status,
         last_seen_at = excluded.last_seen_at,
         seen_count = excluded.seen_count,
         missed_runs = excluded.missed_runs,
         resolved_at = excluded.resolved_at,
         resolved_by = excluded.resolved_by,
         resolution_note = excluded.resolution_note,
         dismissed_until = excluded.dismissed_until,
         updated_at = excluded.updated_at`,
    )
    .bind(
      values.id,
      values.runId,
      values.agentId,
      values.ruleId,
      values.findingKey,
      values.subjectType,
      values.subjectId,
      values.title,
      values.detail,
      values.actionType,
      values.actionEffort,
      values.score,
      values.impact,
      values.confidence,
      values.prizeClicks,
      JSON.stringify(values.evidence),
      JSON.stringify(values.dataQuality),
      values.windowStart,
      values.windowEnd,
      values.baselineStart,
      values.baselineEnd,
      values.status,
      values.firstSeenAt,
      values.lastSeenAt,
      values.seenCount,
      values.missedRuns,
      values.resolvedAt,
      values.resolvedBy,
      values.resolutionNote,
      values.dismissedUntil,
      values.createdAt,
      values.updatedAt,
    )
    .run();
}

async function autoResolveUpdatedSubjects(db: D1Database, nowIso: string): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'resolved', resolved_at = ?, resolved_by = 'system',
           resolution_note = 'The subject post was updated after the finding was last seen.',
           updated_at = ?
       WHERE status = 'open' AND subject_type = 'post'
         AND subject_id IN (
           SELECT id FROM posts WHERE posts.updated_at > analyst_findings.last_seen_at
         )`,
    )
    .bind(nowIso, nowIso)
    .run();

  return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
}

async function listTrackedFindings(db: D1Database): Promise<AnalystFindingRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM analyst_findings
       WHERE status IN ('open', 'actioned', 'dismissed')`,
    )
    .all<AnalystFindingRow>();

  return (result.results ?? []).map(toFinding);
}

async function listFindingsByTargets(
  db: D1Database,
  candidates: readonly AnalystCandidate[],
): Promise<AnalystFindingRecord[]> {
  if (candidates.length === 0) {
    return [];
  }

  const clauses = candidates.map(() => '(rule_id = ? AND finding_key = ?)').join(' OR ');
  const bindings = candidates.flatMap((candidate) => [candidate.ruleId, candidate.findingKey]);
  const result = await db
    .prepare(`SELECT * FROM analyst_findings WHERE ${clauses}`)
    .bind(...bindings)
    .all<AnalystFindingRow>();

  return (result.results ?? []).map(toFinding);
}

export async function persistFindings(
  db: D1Database,
  input: {
    runId: string;
    agentId: string;
    window: AnalystWindow;
    candidates: readonly AnalystCandidate[];
    presentKeys: readonly string[];
    now: Date;
  },
): Promise<FindingPersistResult> {
  const nowIso = input.now.toISOString();
  const resolved = await autoResolveUpdatedSubjects(db, nowIso);
  const [tracked, targeted] = await Promise.all([
    listTrackedFindings(db),
    listFindingsByTargets(db, input.candidates),
  ]);
  const existingByKey = new Map<string, AnalystFindingRecord>();

  for (const finding of [...tracked, ...targeted]) {
    existingByKey.set(findingMapKey(finding.ruleId, finding.findingKey), finding);
  }

  const targetKeys = new Set(
    input.candidates.map((candidate) => findingMapKey(candidate.ruleId, candidate.findingKey)),
  );
  const present = new Set(input.presentKeys);
  const result: FindingPersistResult = {
    inserted: 0,
    refreshed: 0,
    preserved: 0,
    expired: 0,
    resolved,
  };

  for (const candidate of input.candidates) {
    const key = findingMapKey(candidate.ruleId, candidate.findingKey);
    const existing = existingByKey.get(key) ?? null;
    const planned = planFindingWrite(existing, candidate, {
      runId: input.runId,
      agentId: input.agentId,
      window: input.window,
      nowIso,
      newId: crypto.randomUUID(),
    });

    await writeFinding(db, planned.values);

    if (planned.action === 'insert') {
      result.inserted += 1;
    } else if (planned.action === 'refresh') {
      result.refreshed += 1;
    } else {
      result.preserved += 1;
    }
  }

  for (const finding of tracked) {
    const key = findingMapKey(finding.ruleId, finding.findingKey);

    if (targetKeys.has(key)) {
      continue;
    }

    if (present.has(key)) {
      await db
        .prepare('UPDATE analyst_findings SET missed_runs = 0 WHERE id = ?')
        .bind(finding.id)
        .run();
      continue;
    }

    const miss = planFindingMiss(finding.missedRuns);

    if (miss.expire) {
      await db
        .prepare(
          `UPDATE analyst_findings
           SET status = 'expired', missed_runs = ?, resolved_at = ?, resolved_by = 'system',
               resolution_note = ?, updated_at = ?
           WHERE id = ? AND status IN ('open', 'actioned', 'dismissed')`,
        )
        .bind(miss.missedRuns, nowIso, analystFindingExpiryNote(), nowIso, finding.id)
        .run();
      result.expired += 1;
    } else {
      await db
        .prepare('UPDATE analyst_findings SET missed_runs = ? WHERE id = ?')
        .bind(miss.missedRuns, finding.id)
        .run();
    }
  }

  return result;
}

export async function recordSourceStatuses(
  db: D1Database,
  runId: string,
  statuses: readonly AnalystSourceStatus[],
  now: Date = new Date(),
): Promise<void> {
  for (const status of statuses) {
    await db
      .prepare(
        `INSERT INTO analyst_source_status (id, run_id, source, status, detail, remediation, row_count, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, source) DO UPDATE SET
           status = excluded.status,
           detail = excluded.detail,
           remediation = excluded.remediation,
           row_count = excluded.row_count,
           checked_at = excluded.checked_at`,
      )
      .bind(
        crypto.randomUUID(),
        runId,
        status.source,
        status.status,
        status.detail,
        status.remediation,
        status.rowCount,
        now.toISOString(),
      )
      .run();
  }
}

export async function listOpenPlannerFindings(
  db: D1Database,
  limit = 10,
): Promise<AnalystFindingRecord[]> {
  const bounded = Math.min(Math.max(limit, 1), 50);
  const result = await db
    .prepare(
      `SELECT * FROM analyst_findings
       WHERE rule_id = 'new_topic' AND status = 'open'
       ORDER BY score DESC, last_seen_at DESC
       LIMIT ?`,
    )
    .bind(bounded)
    .all<AnalystFindingRow>();

  return (result.results ?? []).map(toFinding);
}

export async function countOpenFindingsByRule(db: D1Database, ruleId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM analyst_findings WHERE rule_id = ? AND status = 'open'")
    .bind(ruleId)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export interface AnalystSourceStatusRecord extends AnalystSourceStatus {
  checkedAt: string;
}

export async function listLatestAnalystSourceStatuses(
  db: D1Database,
): Promise<AnalystSourceStatusRecord[]> {
  const result = await db
    .prepare(
      `SELECT source, status, detail, remediation, row_count, checked_at
       FROM analyst_source_status current
       WHERE current.checked_at = (
         SELECT MAX(checked_at) FROM analyst_source_status WHERE source = current.source
       )`,
    )
    .all<{
      source: string;
      status: string;
      detail: string;
      remediation: string;
      row_count: number;
      checked_at: string;
    }>();

  return (result.results ?? []).map((row) => ({
    source: row.source as AnalystSource,
    status: row.status === 'ok' || row.status === 'missing' ? row.status : 'error',
    detail: row.detail,
    remediation: row.remediation,
    rowCount: row.row_count,
    checkedAt: row.checked_at,
  }));
}

export async function markFindingActioned(
  db: D1Database,
  findingId: string,
  topicId: string,
  agentId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'actioned', resolved_by = ?, resolution_note = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .bind(agentId, `Created topic ${topicId}`, now.toISOString(), findingId)
    .run();
}

export async function dismissFinding(
  db: D1Database,
  findingId: string,
  dismissedUntil: string,
  now: Date = new Date(),
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'dismissed', dismissed_until = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(dismissedUntil, now.toISOString(), findingId)
    .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

  if (changed !== 1) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }
}

export async function resolveFinding(
  db: D1Database,
  findingId: string,
  resolvedBy: string,
  note: string | null,
  now: Date = new Date(),
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE analyst_findings
       SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolution_note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(now.toISOString(), resolvedBy, note, now.toISOString(), findingId)
    .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

  if (changed !== 1) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'That finding does not exist.');
  }
}
