import { ApiError } from '../errors';
import {
  DEFAULT_MODEL_PROVIDER,
  defaultModelForProvider,
  getModelProvider,
  type ModelProviderId,
} from './model-providers';
import { isRunActive } from './reaper';
import {
  type AgentRole,
  type AgentScheduleMode,
  DEFAULT_AGENT_SCHEDULE_MODE,
  getRoleDefinition,
  MAX_AGENTS,
  MAX_AGENTS_BY_ROLE,
  MAX_RUNS_PER_DAY,
  MIN_RUNS_PER_DAY,
} from './roles';
import { nextScheduledHourRun, parseScheduleHours, serializeScheduleHours } from './schedule-hours';

export const SYSTEM_ANALYST_AGENT_ID = 'agent-analyst-performance';
export const SYSTEM_ANALYST_AGENT_NAME = 'Performance Analyst';

export interface AgentRecord {
  id: string;
  name: string;
  role: AgentRole;
  prompt: string;
  categories: string[];
  provider: ModelProviderId;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  scheduleMode: AgentScheduleMode | null;
  scheduleHours: number[];
  systemManaged: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInput {
  name: string;
  role: AgentRole;
  prompt: string;
  categories?: string[];
  provider: ModelProviderId;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  scheduleMode?: AgentScheduleMode;
  scheduleHours?: number[];
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  summary: string | null;
  output: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  prompt: string;
  categories: string | null;
  provider: string;
  model: string;
  runs_per_day: number;
  enabled: number;
  auto_publish: number;
  schedule_mode: string | null;
  schedule_hours: string | null;
  system_managed: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentRunRow {
  id: string;
  agent_id: string;
  status: string;
  summary: string | null;
  output: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

const RUNS_PER_DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * RUNS_PER_DAY_MS;

export const MAX_AGENT_CATEGORIES = 6;

function readCategoryEntries(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);

      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return trimmed.split(',');
}

export function parseAgentCategories(value: unknown): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const entry of readCategoryEntries(value)) {
    const category = entry.trim();
    if (!category || seen.has(category)) {
      continue;
    }

    seen.add(category);
    categories.push(category);

    if (categories.length >= MAX_AGENT_CATEGORIES) {
      break;
    }
  }

  return categories;
}

export function serializeAgentCategories(categories: readonly string[]): string {
  return JSON.stringify(parseAgentCategories(categories));
}

export function mergeWriterCategories(values: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const categories of values) {
    for (const category of categories) {
      const normalized = category.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
}

function readScheduleMode(value: unknown): AgentScheduleMode | null {
  if (
    value === 'manual' ||
    value === 'interval' ||
    value === 'daily' ||
    value === 'weekly' ||
    value === 'hours'
  ) {
    return value;
  }

  return null;
}

export function scheduleModeUsesRunInterval(mode: AgentScheduleMode | null): boolean {
  return mode === null || mode === 'interval';
}

function toAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role as AgentRole,
    prompt: row.prompt,
    categories: parseAgentCategories(row.categories),
    provider: getModelProvider(row.provider)
      ? (row.provider as ModelProviderId)
      : DEFAULT_MODEL_PROVIDER,
    model: row.model,
    runsPerDay: row.runs_per_day,
    enabled: row.enabled === 1,
    autoPublish: row.auto_publish === 1,
    scheduleMode: readScheduleMode(row.schedule_mode),
    scheduleHours: parseScheduleHours(row.schedule_hours),
    systemManaged: row.system_managed === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readRunStatus(value: string): AgentRunRecord['status'] {
  if (value === 'running' || value === 'failed' || value === 'skipped') {
    return value;
  }

  return 'succeeded';
}

export function hasRepeatedFailures(statuses: readonly string[]): boolean {
  return statuses.length === 3 && statuses.every((status) => status === 'failed');
}

function toRun(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    status: readRunStatus(row.status),
    summary: row.summary,
    output: row.output,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function computeNextRunAt(runsPerDay: number, from: Date = new Date()): string {
  const clamped = Math.min(Math.max(runsPerDay, MIN_RUNS_PER_DAY), MAX_RUNS_PER_DAY);
  const intervalMs = RUNS_PER_DAY_MS / clamped;
  return new Date(from.getTime() + intervalMs).toISOString();
}

export interface AgentScheduleInput {
  scheduleMode: AgentScheduleMode | null;
  runsPerDay: number;
  scheduleHours?: number[] | null;
}

export function computeAgentNextRunAt(
  agent: AgentScheduleInput,
  from: Date = new Date(),
): string | null {
  if (agent.scheduleMode === 'manual') {
    return null;
  }

  if (agent.scheduleMode === 'weekly') {
    return new Date(from.getTime() + WEEK_MS).toISOString();
  }

  if (agent.scheduleMode === 'hours') {
    const scheduled = nextScheduledHourRun(agent.scheduleHours ?? [], from);

    if (scheduled) {
      return scheduled.toISOString();
    }
  }

  return computeNextRunAt(agent.runsPerDay, from);
}

function requireNonSystemRole(role: AgentRole): void {
  const definition = getRoleDefinition(role);

  if (definition.systemManaged) {
    throw new ApiError(
      409,
      'AGENT_PROTECTED',
      `${definition.label} is created by the system and cannot be created or reassigned manually.`,
    );
  }
}

function assertAgentUpdateAllowed(existing: AgentRecord, input: AgentInput): void {
  const definition = getRoleDefinition(existing.role);

  if (!definition.systemManaged) {
    requireNonSystemRole(input.role);
    return;
  }

  if (input.role !== existing.role) {
    throw new ApiError(
      409,
      'AGENT_PROTECTED',
      `${definition.label} keeps its role. Switch it to manual schedule instead.`,
    );
  }

  if (!input.enabled) {
    throw new ApiError(
      409,
      'AGENT_PROTECTED',
      `${definition.label} cannot be disabled. Switch it to manual schedule instead.`,
    );
  }
}

export async function countAgents(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM agents').first<{ total: number }>();
  return row?.total ?? 0;
}

async function countAgentsByRole(db: D1Database, role: AgentRole): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM agents WHERE role = ?')
    .bind(role)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function listAgents(db: D1Database): Promise<AgentRecord[]> {
  const result = await db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all<AgentRow>();

  return (result.results ?? []).map(toAgent);
}

export async function findAgent(db: D1Database, id: string): Promise<AgentRecord | null> {
  const row = await db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first<AgentRow>();
  return row ? toAgent(row) : null;
}

export async function getAgent(db: D1Database, id: string): Promise<AgentRecord> {
  const agent = await findAgent(db, id);
  if (!agent) {
    throw new ApiError(404, 'AGENT_NOT_FOUND', 'That agent does not exist.');
  }

  return agent;
}

export async function createAgent(db: D1Database, input: AgentInput): Promise<AgentRecord> {
  requireNonSystemRole(input.role);

  const [total, byRole] = await Promise.all([countAgents(db), countAgentsByRole(db, input.role)]);
  const roleLimit = MAX_AGENTS_BY_ROLE[input.role];

  if (total >= MAX_AGENTS) {
    throw new ApiError(409, 'AGENT_LIMIT_REACHED', `You can create at most ${MAX_AGENTS} agents.`);
  }

  if (byRole >= roleLimit) {
    throw new ApiError(
      409,
      'AGENT_LIMIT_REACHED',
      `You can create at most ${roleLimit} ${input.role} agents.`,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();
  const scheduleMode = input.scheduleMode ?? DEFAULT_AGENT_SCHEDULE_MODE;
  const nextRunAt = scheduleMode === 'manual' ? null : nowIso;

  await db
    .prepare(
      `INSERT INTO agents (id, name, role, prompt, categories, provider, model, runs_per_day, enabled,
        auto_publish, schedule_mode, schedule_hours, system_managed, last_run_at, next_run_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.role,
      input.prompt,
      serializeAgentCategories(input.categories ?? []),
      input.provider,
      input.model,
      input.runsPerDay,
      input.enabled ? 1 : 0,
      input.autoPublish ? 1 : 0,
      scheduleMode,
      serializeScheduleHours(input.scheduleHours),
      nextRunAt,
      nowIso,
      nowIso,
    )
    .run();

  return getAgent(db, id);
}

export async function updateAgent(
  db: D1Database,
  id: string,
  input: AgentInput,
): Promise<AgentRecord> {
  const existing = await getAgent(db, id);
  assertAgentUpdateAllowed(existing, input);

  const scheduleMode = input.scheduleMode ?? existing.scheduleMode;
  const scheduleHours = parseScheduleHours(input.scheduleHours ?? existing.scheduleHours);
  const next: AgentRecord = existing.systemManaged
    ? { ...existing, name: input.name, prompt: input.prompt, scheduleMode, scheduleHours }
    : {
        ...existing,
        name: input.name,
        role: input.role,
        prompt: input.prompt,
        categories: parseAgentCategories(input.categories ?? []),
        model: input.model,
        runsPerDay: input.runsPerDay,
        enabled: input.enabled,
        autoPublish: input.autoPublish,
        scheduleMode,
        scheduleHours,
      };

  const scheduleChanged =
    next.scheduleMode !== existing.scheduleMode ||
    next.runsPerDay !== existing.runsPerDay ||
    serializeScheduleHours(next.scheduleHours) !== serializeScheduleHours(existing.scheduleHours);
  const nextRunAt = existing.systemManaged
    ? scheduleChanged
      ? computeAgentNextRunAt(next)
      : existing.nextRunAt
    : computeAgentNextRunAt(next);

  await db
    .prepare(
      `UPDATE agents SET name = ?, role = ?, prompt = ?, categories = ?, provider = ?, model = ?, runs_per_day = ?,
        enabled = ?, auto_publish = ?, schedule_mode = ?, next_run_at = ?, updated_at = ?,
        schedule_hours = ? WHERE id = ?`,
    )
    .bind(
      next.name,
      next.role,
      next.prompt,
      serializeAgentCategories(next.categories),
      next.provider,
      next.model,
      next.runsPerDay,
      next.enabled ? 1 : 0,
      next.autoPublish ? 1 : 0,
      next.scheduleMode === null ? 'interval' : next.scheduleMode,
      nextRunAt,
      new Date().toISOString(),
      serializeScheduleHours(next.scheduleHours),
      id,
    )
    .run();

  return getAgent(db, id);
}

export async function setAgentEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
): Promise<AgentRecord> {
  const existing = await getAgent(db, id);

  if (existing.systemManaged && !enabled) {
    const definition = getRoleDefinition(existing.role);
    throw new ApiError(
      409,
      'AGENT_PROTECTED',
      `${definition.label} cannot be disabled. Switch it to manual schedule instead.`,
    );
  }

  await db
    .prepare('UPDATE agents SET enabled = ?, updated_at = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, new Date().toISOString(), id)
    .run();

  return getAgent(db, id);
}

export async function deleteAgent(db: D1Database, id: string): Promise<void> {
  const existing = await getAgent(db, id);

  if (existing.systemManaged) {
    const definition = getRoleDefinition(existing.role);
    throw new ApiError(
      409,
      'AGENT_PROTECTED',
      `${definition.label} cannot be deleted. Switch it to manual schedule instead.`,
    );
  }

  await db.prepare('DELETE FROM agent_runs WHERE agent_id = ?').bind(id).run();
  await db.prepare('DELETE FROM agents WHERE id = ?').bind(id).run();
}

export async function listDueAgents(db: D1Database, nowIso: string): Promise<AgentRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM agents
       WHERE enabled = 1 AND (schedule_mode IS NULL OR schedule_mode != 'manual')
         AND (next_run_at IS NULL OR next_run_at <= ?)
       ORDER BY COALESCE(next_run_at, created_at) ASC`,
    )
    .bind(nowIso)
    .all<AgentRow>();

  return (result.results ?? []).map(toAgent);
}

export interface ClaimAgentRunOptions {
  now?: Date;
  force?: boolean;
}

export async function claimAgentRun(
  db: D1Database,
  agent: AgentRecord,
  options: ClaimAgentRunOptions = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  const running = await db
    .prepare(
      `SELECT id, started_at FROM agent_runs
       WHERE agent_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(agent.id)
    .first<{ id: string; started_at: string }>();

  if (running && isRunActive(running.started_at, now)) {
    return false;
  }

  const nowIso = now.toISOString();
  const nextRunAt = computeAgentNextRunAt(agent, now);
  const result = options.force
    ? await db
        .prepare('UPDATE agents SET next_run_at = ?, updated_at = ? WHERE id = ?')
        .bind(nextRunAt, nowIso, agent.id)
        .run()
    : await db
        .prepare(
          `UPDATE agents SET next_run_at = ?, updated_at = ?
           WHERE id = ? AND enabled = 1 AND (schedule_mode IS NULL OR schedule_mode != 'manual')
             AND (next_run_at IS NULL OR next_run_at <= ?)`,
        )
        .bind(nextRunAt, nowIso, agent.id, nowIso)
        .run();

  const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  return changed === 1;
}

export async function markAgentRun(
  db: D1Database,
  agent: AgentRecord,
  ranAt: Date = new Date(),
): Promise<void> {
  const now = new Date();
  const baseline = ranAt.getTime() > now.getTime() ? ranAt : now;

  await db
    .prepare(
      `UPDATE agents SET last_run_at = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(ranAt.toISOString(), computeAgentNextRunAt(agent, baseline), now.toISOString(), agent.id)
    .run();
}

export async function createAgentRun(db: D1Database, agentId: string): Promise<string> {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO agent_runs (id, agent_id, status, summary, output, tokens_in, tokens_out, error, started_at, finished_at)
       VALUES (?, ?, 'running', NULL, NULL, NULL, NULL, NULL, ?, NULL)`,
    )
    .bind(id, agentId, new Date().toISOString())
    .run();

  return id;
}

export interface AgentRunOutcome {
  status: 'succeeded' | 'failed' | 'skipped';
  summary: string;
  output?: string;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}

export async function finishAgentRun(
  db: D1Database,
  runId: string,
  outcome: AgentRunOutcome,
): Promise<void> {
  await db
    .prepare(
      `UPDATE agent_runs SET status = ?, summary = ?, output = ?, tokens_in = ?, tokens_out = ?,
        error = ?, finished_at = ? WHERE id = ? AND status = 'running'`,
    )
    .bind(
      outcome.status,
      outcome.summary,
      outcome.output ?? null,
      outcome.tokensIn ?? null,
      outcome.tokensOut ?? null,
      outcome.error ?? null,
      new Date().toISOString(),
      runId,
    )
    .run();
}

export interface SystemAgentReconciliation {
  changed: boolean;
  summary: string | null;
}

export async function reconcileSystemAgents(db: D1Database): Promise<SystemAgentReconciliation> {
  const existing = await findAgent(db, SYSTEM_ANALYST_AGENT_ID);

  if (!existing) {
    const definition = getRoleDefinition('analyst');
    const now = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO agents (id, name, role, prompt, categories, provider, model, runs_per_day,
          enabled, auto_publish, schedule_mode, system_managed, last_run_at, next_run_at,
          created_at, updated_at)
         VALUES (?, ?, 'analyst', ?, '[]', ?, ?, 1, 1, 0, 'weekly', 1, NULL, ?, ?, ?)`,
      )
      .bind(
        SYSTEM_ANALYST_AGENT_ID,
        SYSTEM_ANALYST_AGENT_NAME,
        definition.defaultPrompt,
        DEFAULT_MODEL_PROVIDER,
        defaultModelForProvider(DEFAULT_MODEL_PROVIDER),
        now,
        now,
        now,
      )
      .run();

    const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

    if (changed === 1) {
      return {
        changed: true,
        summary: 'Recreated the performance analyst after it was missing.',
      };
    }

    return {
      changed: false,
      summary: 'The performance analyst could not be recreated because its slot is taken.',
    };
  }

  if (existing.role === 'analyst' && !existing.systemManaged) {
    await db
      .prepare(
        `UPDATE agents SET system_managed = 1, schedule_mode = 'weekly', updated_at = ?
         WHERE id = ?`,
      )
      .bind(new Date().toISOString(), SYSTEM_ANALYST_AGENT_ID)
      .run();

    return {
      changed: true,
      summary: 'Restored system protection on the performance analyst.',
    };
  }

  if (existing.role !== 'analyst') {
    return {
      changed: false,
      summary: `The id ${SYSTEM_ANALYST_AGENT_ID} is held by a ${existing.role} agent, so the performance analyst could not be reconciled.`,
    };
  }

  return { changed: false, summary: null };
}

export async function listAgentRuns(
  db: D1Database,
  agentId: string,
  limit = 10,
): Promise<AgentRunRecord[]> {
  const bounded = Math.min(Math.max(limit, 1), 50);
  const result = await db
    .prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?')
    .bind(agentId, bounded)
    .all<AgentRunRow>();

  return (result.results ?? []).map(toRun);
}

export async function getAgentRun(db: D1Database, runId: string): Promise<AgentRunRecord> {
  const row = await db
    .prepare('SELECT * FROM agent_runs WHERE id = ?')
    .bind(runId)
    .first<AgentRunRow>();

  if (!row) {
    throw new ApiError(404, 'AGENT_RUN_NOT_FOUND', 'That agent run does not exist.');
  }

  return toRun(row);
}
