import type { ActivityEntry, ActorSummary, ActorType } from '@/lib/activity/store';
import type { AgentRunRecord } from '@/lib/agents/store';

export type { ActivityEntry };

export type ActivityScope = 'all' | 'user' | 'agent';
export type ActivityActorType = ActorType;
export type ActivityRunStatus = AgentRunRecord['status'];
export type ActivityBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export type ActivityActorSummary = ActorSummary;

export interface ActivityFilters {
  scope: ActivityScope;
  actorId: string;
  action: string;
  targetType: string;
  search: string;
  since: string;
  until: string;
}

export type ActivityRunRecord = AgentRunRecord;

export interface ActivityRunAgent {
  id: string;
  name: string;
  role: string;
}

export interface ActivityRunDetail {
  run: ActivityRunRecord;
  agent: ActivityRunAgent | null;
  activity: ActivityEntry[];
}

export interface ActivityRetryResult {
  runId: string;
  status: ActivityRunStatus;
  summary: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  total: number;
  actions: string[];
}

export interface ActivityQueryOptions {
  filters: ActivityFilters;
  page: number;
  pageSize: number;
}

export interface ActivityTargetPresentation {
  label: string;
  mode: 'link' | 'text';
}

export interface RunStatusPresentation {
  label: string;
  badge: ActivityBadgeVariant;
}

export const ACTIVITY_PAGE_SIZE = 25;

const TARGET_PRESENTATIONS: Record<string, ActivityTargetPresentation> = {
  post: { label: 'Post', mode: 'link' },
  page: { label: 'Page', mode: 'link' },
  category: { label: 'Category', mode: 'link' },
  agent: { label: 'Agent', mode: 'link' },
  redirect: { label: 'Redirect', mode: 'link' },
  affiliate_product: { label: 'Product', mode: 'link' },
  affiliate_program: { label: 'Program', mode: 'link' },
  topic: { label: 'Topic', mode: 'text' },
  source: { label: 'Source', mode: 'text' },
  share_channel: { label: 'Channel', mode: 'text' },
  share_job: { label: 'Share job', mode: 'text' },
  media: { label: 'Media', mode: 'text' },
};

const RUN_STATUS_PRESENTATIONS: Record<ActivityRunStatus, RunStatusPresentation> = {
  running: { label: 'Running', badge: 'secondary' },
  succeeded: { label: 'Succeeded', badge: 'default' },
  failed: { label: 'Failed', badge: 'destructive' },
  skipped: { label: 'Skipped', badge: 'outline' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNullableString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNullableNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readActorType(value: unknown): ActivityActorType {
  return value === 'agent' ? 'agent' : 'user';
}

function parseActivityEntry(value: unknown): ActivityEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const createdAt = readString(value, 'createdAt');
  const summary = readString(value, 'summary');
  if (id === null || createdAt === null || summary === null) {
    return null;
  }

  const metadata = value.metadata;

  return {
    id,
    actorId: readString(value, 'actorId') ?? '',
    actorType: readActorType(value.actorType),
    actorLabel: readString(value, 'actorLabel') ?? '',
    action: readString(value, 'action') ?? '',
    targetType: readNullableString(value, 'targetType'),
    targetId: readNullableString(value, 'targetId'),
    summary,
    createdAt,
    runId: readNullableString(value, 'runId'),
    metadata: isRecord(metadata) ? metadata : null,
  };
}

export function parseActivityEntries(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: ActivityEntry[] = [];
  for (const candidate of value) {
    const entry = parseActivityEntry(candidate);
    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries;
}

export function parseActivityResponse(value: unknown): ActivityPage {
  if (!isRecord(value)) {
    return { entries: [], total: 0, actions: [] };
  }

  const total = readNullableNumber(value, 'total') ?? 0;
  const actions = Array.isArray(value.actions)
    ? value.actions.filter((action): action is string => typeof action === 'string')
    : [];

  return {
    entries: parseActivityEntries(value.activity),
    total: Math.max(0, Math.trunc(total)),
    actions,
  };
}

export function parseActorResponse(value: unknown): ActivityActorSummary[] {
  if (!isRecord(value) || !Array.isArray(value.actors)) {
    return [];
  }

  const actors: ActivityActorSummary[] = [];
  for (const candidate of value.actors) {
    if (!isRecord(candidate)) {
      continue;
    }

    const id = readString(candidate, 'id');
    const label = readString(candidate, 'label');
    if (id === null || label === null) {
      continue;
    }

    actors.push({
      id,
      type: readActorType(candidate.type),
      label,
      activityCount: readNullableNumber(candidate, 'activityCount') ?? 0,
      lastActiveAt: readNullableString(candidate, 'lastActiveAt'),
    });
  }

  return actors;
}

export function parseRunDetailResponse(value: unknown): ActivityRunDetail | null {
  if (!isRecord(value) || !isRecord(value.run)) {
    return null;
  }

  const id = readString(value.run, 'id');
  const startedAt = readString(value.run, 'startedAt');
  if (id === null || startedAt === null) {
    return null;
  }

  const status = resolveRunStatus(value.run.status) ?? 'running';
  const agentSource = isRecord(value.agent) ? value.agent : null;
  const agentId = agentSource === null ? null : readString(agentSource, 'id');
  const agentName = agentSource === null ? null : readString(agentSource, 'name');

  return {
    run: {
      id,
      agentId: readString(value.run, 'agentId') ?? agentId ?? '',
      status,
      summary: readNullableString(value.run, 'summary'),
      output: readNullableString(value.run, 'output'),
      tokensIn: readNullableNumber(value.run, 'tokensIn'),
      tokensOut: readNullableNumber(value.run, 'tokensOut'),
      error: readNullableString(value.run, 'error'),
      startedAt,
      finishedAt: readNullableString(value.run, 'finishedAt'),
    },
    agent:
      agentId !== null && agentName !== null
        ? { id: agentId, name: agentName, role: readString(agentSource ?? {}, 'role') ?? 'agent' }
        : null,
    activity: parseActivityEntries(value.activity),
  };
}

export function parseRetryResponse(value: unknown): ActivityRetryResult | null {
  if (!isRecord(value) || !isRecord(value.result)) {
    return null;
  }

  const runId = readString(value.result, 'runId');
  const summary = readString(value.result, 'summary');
  if (runId === null || summary === null) {
    return null;
  }

  return {
    runId,
    status: resolveRunStatus(value.result.status) ?? 'failed',
    summary,
  };
}

export function resolveRunStatus(value: unknown): ActivityRunStatus | null {
  if (value === 'running' || value === 'succeeded' || value === 'failed' || value === 'skipped') {
    return value;
  }

  return null;
}

export function resolveRunStatusPresentation(value: string): RunStatusPresentation {
  const status = resolveRunStatus(value);
  if (status === null) {
    return { label: 'Unknown', badge: 'outline' };
  }

  return RUN_STATUS_PRESENTATIONS[status];
}

export function resolveTargetPresentation(targetType: string | null): ActivityTargetPresentation {
  if (targetType === null || targetType.length === 0) {
    return { label: 'Entry', mode: 'text' };
  }

  return TARGET_PRESENTATIONS[targetType] ?? { label: targetType, mode: 'text' };
}

export function resolveTargetHref(
  targetType: string | null,
  targetId: string | null,
): string | null {
  if (targetId === null || targetId.length === 0) {
    return null;
  }

  const encodedId = encodeURIComponent(targetId);

  switch (targetType) {
    case 'post':
      return `/dashboard/posts/${encodedId}/edit`;
    case 'page':
      return `/dashboard/pages/${encodedId}/edit`;
    case 'agent':
      return `/dashboard/agents/${encodedId}/edit`;
    case 'redirect':
      return '/dashboard/redirects';
    case 'category':
      return '/dashboard/categories';
    case 'affiliate_product':
      return '/dashboard/monetization/catalog';
    case 'affiliate_program':
      return '/dashboard/monetization/settings';
    default:
      return null;
  }
}

export function buildActivitySearchQuery(options: ActivityQueryOptions): string {
  const params = new URLSearchParams();
  const { filters } = options;

  if (filters.scope !== 'all') {
    params.set('type', filters.scope);
  }
  if (filters.actorId.length > 0) {
    params.set('actor', filters.actorId);
  }
  if (filters.action.length > 0) {
    params.set('action', filters.action);
  }
  if (filters.targetType.length > 0) {
    params.set('targetType', filters.targetType);
  }
  if (filters.search.length > 0) {
    params.set('q', filters.search);
  }
  if (filters.since.length > 0) {
    params.set('since', `${filters.since}T00:00:00.000Z`);
  }
  if (filters.until.length > 0) {
    params.set('until', `${filters.until}T23:59:59.999Z`);
  }

  params.set('limit', String(options.pageSize));
  params.set('offset', String((options.page - 1) * options.pageSize));

  return params.toString();
}

export function hasActiveActivityFilters(filters: ActivityFilters, query: string): boolean {
  return (
    filters.scope !== 'all' ||
    filters.actorId.length > 0 ||
    filters.action.length > 0 ||
    filters.targetType.length > 0 ||
    filters.since.length > 0 ||
    filters.until.length > 0 ||
    query.length > 0
  );
}

export function formatRangeLabel(
  total: number,
  page: number,
  pageSize: number,
  visible: number,
): string {
  if (total === 0) {
    return 'No entries';
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + Math.max(0, visible - 1);
  return `Showing ${start} to ${end} of ${total}`;
}

export function formatPaginationSummary(total: number, page: number, pageSize: number): string {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return `Page ${Math.min(Math.max(1, page), totalPages)} of ${totalPages}`;
}

export function formatAbsoluteTime(value: string | null): string {
  if (value === null || value.length === 0) {
    return 'Not recorded';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Unknown time';
  }

  return new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function initialsOf(label: string): string {
  const words = label.split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function formatTokenCount(value: number | null): string {
  if (value === null) {
    return 'Not recorded';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

export function buildRetryToastMessage(result: ActivityRetryResult): string {
  const label = resolveRunStatusPresentation(result.status).label;
  return result.summary.trim().length > 0 ? result.summary : `Run finished with status ${label}.`;
}
