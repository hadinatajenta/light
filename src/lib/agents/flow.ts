import { loadAgentLiveSnapshot } from './live';
import { listAgents } from './store';
import { countTopics } from './topics';

export const FLOW_STAGE_IDS = [
  'planner',
  'researcher',
  'writer',
  'qc',
  'reviewer',
  'published',
] as const;

export type FlowStageId = (typeof FLOW_STAGE_IDS)[number];

export interface FlowAgentRef {
  id: string;
  name: string;
  role: string;
  runsPerDay: number;
  cadenceLabel: string;
  running: boolean;
  nextRunAt: string | null;
  enabled: boolean;
}

export interface FlowStage {
  id: FlowStageId;
  label: string;
  description: string;
  waiting: number;
  active: number;
  doneToday: number;
  bounced: number;
  agents: FlowAgentRef[];
}

export interface FlowCounts {
  plannedToday: number;
  queuedTopics: number;
  fetchedTopics: number;
  researchedTopics: number;
  inProgressScrapper: number;
  inProgressWriter: number;
  pendingDrafts: number;
  inReviewQc: number;
  inReviewReviewer: number;
  publishedToday: number;
  blockedTopics: number;
  changesRequestedDrafts: number;
}

export interface FlowActivityCounts {
  planner: number;
  scrapper: number;
  writer: number;
  qc: number;
  reviewer: number;
}

const CADENCE_LABELS: Record<number, string> = {
  1: 'daily',
  2: 'every 12h',
  3: 'every 8h',
  4: 'every 6h',
  5: 'every 5h',
  6: 'every 4h',
  8: 'every 3h',
  12: 'every 2h',
  24: 'hourly',
  48: 'every 30m',
  96: 'every 15m',
};

const MINUTES_PER_DAY = 24 * 60;

const ROLE_STAGE: Record<string, FlowStageId> = {
  planner: 'planner',
  scrapper: 'researcher',
  writer: 'writer',
  qc: 'qc',
  reviewer: 'reviewer',
};

const ACTION_ROLE: Record<string, keyof FlowActivityCounts> = {
  'agent.planner': 'planner',
  'agent.scrapper': 'scrapper',
  'agent.writer': 'writer',
  'agent.qc': 'qc',
  'agent.reviewer': 'reviewer',
};

const STAGE_DEFINITIONS: Record<FlowStageId, { label: string; description: string }> = {
  planner: {
    label: 'Planner',
    description: 'Proposes new topics so the queue always has something to write.',
  },
  researcher: {
    label: 'Researcher',
    description: 'Researches a topic from live web sources so writers have verifiable material.',
  },
  writer: {
    label: 'Writer',
    description: 'Drafts a new buying guide from the next researched topic.',
  },
  qc: {
    label: 'QC',
    description:
      'Audits pending drafts for formatting, SEO fields, and policy issues. Shares the pending draft pool with the reviewer.',
  },
  reviewer: {
    label: 'Reviewer',
    description:
      'Approves the oldest pending draft or requests changes. Shares the pending draft pool with QC.',
  },
  published: {
    label: 'Published',
    description: 'Articles released to the publication.',
  },
};

interface RoleCountRow {
  role: string;
  total: number;
}

interface ReviewRow {
  review_status: string | null;
  role: string | null;
  total: number;
}

interface ActionCountRow {
  action: string;
  total: number;
}

function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export function cadenceLabel(runsPerDay: number): string {
  const known = CADENCE_LABELS[runsPerDay];
  if (known !== undefined) {
    return known;
  }

  if (!Number.isFinite(runsPerDay) || runsPerDay < 1) {
    return 'daily';
  }

  const minutes = MINUTES_PER_DAY / runsPerDay;

  if (minutes >= 60) {
    return `every ${Math.round(minutes / 60)}h`;
  }

  return `every ${Math.round(minutes)}m`;
}

function stageMetrics(
  stage: FlowStageId,
  counts: FlowCounts,
  activity: FlowActivityCounts,
): { waiting: number; active: number; doneToday: number; bounced: number } {
  if (stage === 'planner') {
    return { waiting: 0, active: 0, doneToday: counts.plannedToday, bounced: 0 };
  }

  if (stage === 'researcher') {
    return {
      waiting: counts.queuedTopics + counts.fetchedTopics,
      active: counts.inProgressScrapper,
      doneToday: activity.scrapper,
      bounced: counts.blockedTopics,
    };
  }

  if (stage === 'writer') {
    return {
      waiting: counts.researchedTopics,
      active: counts.inProgressWriter,
      doneToday: activity.writer,
      bounced: counts.changesRequestedDrafts,
    };
  }

  if (stage === 'qc') {
    return {
      waiting: counts.pendingDrafts,
      active: counts.inReviewQc,
      doneToday: activity.qc,
      bounced: 0,
    };
  }

  if (stage === 'reviewer') {
    return {
      waiting: counts.pendingDrafts,
      active: counts.inReviewReviewer,
      doneToday: activity.reviewer,
      bounced: 0,
    };
  }

  return { waiting: 0, active: 0, doneToday: counts.publishedToday, bounced: 0 };
}

export function buildFlowStages(
  counts: FlowCounts,
  activity: FlowActivityCounts,
  agents: FlowAgentRef[],
): FlowStage[] {
  return FLOW_STAGE_IDS.map((id) => {
    const definition = STAGE_DEFINITIONS[id];
    const metrics = stageMetrics(id, counts, activity);

    return {
      id,
      label: definition.label,
      description: definition.description,
      waiting: metrics.waiting,
      active: metrics.active,
      doneToday: metrics.doneToday,
      bounced: metrics.bounced,
      agents: id === 'published' ? [] : agents.filter((agent) => ROLE_STAGE[agent.role] === id),
    };
  });
}

export async function loadAgentFlow(
  db: D1Database,
  now?: Date,
): Promise<{ generatedAt: string; stages: FlowStage[] }> {
  const nowDate = now ?? new Date();
  const startIso = startOfUtcDay(nowDate);

  const [
    agents,
    snapshot,
    topicCounts,
    plannedRow,
    inProgressRows,
    reviewRows,
    activityRows,
    publishedRow,
  ] = await Promise.all([
    listAgents(db),
    loadAgentLiveSnapshot(db),
    countTopics(db),
    db
      .prepare('SELECT COUNT(*) AS total FROM topics WHERE created_at >= ?')
      .bind(startIso)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT a.role AS role, COUNT(*) AS total
         FROM topics t JOIN agents a ON a.id = t.assigned_agent_id
         WHERE t.status = 'in_progress' GROUP BY a.role`,
      )
      .all<RoleCountRow>(),
    db
      .prepare(
        `SELECT p.review_status AS review_status, a.role AS role, COUNT(*) AS total
         FROM posts p LEFT JOIN agents a ON a.id = p.reviewed_by
         WHERE p.status = 'draft'
         GROUP BY p.review_status, a.role`,
      )
      .all<ReviewRow>(),
    db
      .prepare(
        'SELECT action, COUNT(*) AS total FROM activity WHERE created_at >= ? GROUP BY action',
      )
      .bind(startIso)
      .all<ActionCountRow>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM posts
         WHERE status = 'published' AND COALESCE(updated_date, updated_at) >= ?`,
      )
      .bind(startIso)
      .first<{ total: number }>(),
  ]);

  const runningIds = new Set(snapshot.running.map((run) => run.agentId));

  const refs: FlowAgentRef[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    runsPerDay: agent.runsPerDay,
    cadenceLabel: cadenceLabel(agent.runsPerDay),
    running: runningIds.has(agent.id),
    nextRunAt: agent.nextRunAt,
    enabled: agent.enabled,
  }));

  let inProgressScrapper = 0;
  let inProgressWriter = 0;

  for (const row of inProgressRows.results ?? []) {
    if (row.role === 'scrapper') {
      inProgressScrapper += row.total;
    } else if (row.role === 'writer') {
      inProgressWriter += row.total;
    }
  }

  let pendingDrafts = 0;
  let inReviewQc = 0;
  let inReviewReviewer = 0;
  let changesRequestedDrafts = 0;

  for (const row of reviewRows.results ?? []) {
    if (row.review_status === null || row.review_status === 'pending') {
      pendingDrafts += row.total;
    } else if (row.review_status === 'in_review') {
      if (row.role === 'qc') {
        inReviewQc += row.total;
      } else if (row.role === 'reviewer') {
        inReviewReviewer += row.total;
      }
    } else if (row.review_status === 'changes_requested') {
      changesRequestedDrafts += row.total;
    }
  }

  const activity: FlowActivityCounts = { planner: 0, scrapper: 0, writer: 0, qc: 0, reviewer: 0 };

  for (const row of activityRows.results ?? []) {
    const key = ACTION_ROLE[row.action];
    if (key) {
      activity[key] = row.total;
    }
  }

  const counts: FlowCounts = {
    plannedToday: plannedRow?.total ?? 0,
    queuedTopics: topicCounts.queued,
    fetchedTopics: topicCounts.fetched,
    researchedTopics: topicCounts.researched,
    inProgressScrapper,
    inProgressWriter,
    pendingDrafts,
    inReviewQc,
    inReviewReviewer,
    publishedToday: publishedRow?.total ?? 0,
    blockedTopics: topicCounts.blocked,
    changesRequestedDrafts,
  };

  return {
    generatedAt: nowDate.toISOString(),
    stages: buildFlowStages(counts, activity, refs),
  };
}
