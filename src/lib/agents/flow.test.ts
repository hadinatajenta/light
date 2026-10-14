import { describe, expect, it } from 'vitest';
import {
  buildFlowStages,
  cadenceLabel,
  FLOW_STAGE_IDS,
  type FlowActivityCounts,
  type FlowAgentRef,
  type FlowCounts,
  loadStageDetail,
} from './flow';

function makeAgent(
  overrides: Partial<FlowAgentRef> & Pick<FlowAgentRef, 'id' | 'role'>,
): FlowAgentRef {
  return {
    name: overrides.id,
    runsPerDay: 1,
    cadenceLabel: 'daily',
    running: false,
    nextRunAt: null,
    enabled: true,
    ...overrides,
  };
}

const COUNTS: FlowCounts = {
  plannedToday: 5,
  queuedTopics: 3,
  fetchedTopics: 2,
  researchedTopics: 4,
  inProgressScrapper: 1,
  inProgressWriter: 6,
  pendingDrafts: 7,
  inReviewQc: 8,
  inReviewReviewer: 9,
  publishedToday: 10,
  blockedTopics: 2,
  changesRequestedDrafts: 3,
};

const ACTIVITY: FlowActivityCounts = {
  planner: 11,
  scrapper: 12,
  writer: 13,
  qc: 14,
  reviewer: 15,
};

const AGENTS: FlowAgentRef[] = [
  makeAgent({ id: 'planner-1', role: 'planner' }),
  makeAgent({ id: 'scrapper-1', role: 'scrapper' }),
  makeAgent({ id: 'writer-1', role: 'writer' }),
  makeAgent({ id: 'qc-1', role: 'qc' }),
  makeAgent({ id: 'reviewer-1', role: 'reviewer' }),
];

describe('cadenceLabel', () => {
  it('labels every explicitly mapped cadence', () => {
    expect(cadenceLabel(1)).toBe('daily');
    expect(cadenceLabel(2)).toBe('every 12h');
    expect(cadenceLabel(3)).toBe('every 8h');
    expect(cadenceLabel(4)).toBe('every 6h');
    expect(cadenceLabel(5)).toBe('every 5h');
    expect(cadenceLabel(6)).toBe('every 4h');
    expect(cadenceLabel(8)).toBe('every 3h');
    expect(cadenceLabel(12)).toBe('every 2h');
    expect(cadenceLabel(24)).toBe('hourly');
    expect(cadenceLabel(48)).toBe('every 30m');
    expect(cadenceLabel(96)).toBe('every 15m');
  });

  it('rounds unmapped sub-daily cadences to the nearest hour', () => {
    expect(cadenceLabel(7)).toBe('every 3h');
    expect(cadenceLabel(10)).toBe('every 2h');
  });

  it('falls back to hours for slow cadences and minutes for fast ones', () => {
    expect(cadenceLabel(36)).toBe('every 40m');
    expect(cadenceLabel(30)).toBe('every 48m');
  });

  it('defaults to daily for invalid input', () => {
    expect(cadenceLabel(0)).toBe('daily');
    expect(cadenceLabel(Number.NaN)).toBe('daily');
  });
});

describe('buildFlowStages', () => {
  const stages = buildFlowStages(COUNTS, ACTIVITY, AGENTS);

  it('returns every stage in the declared order', () => {
    expect(stages.map((stage) => stage.id)).toEqual([...FLOW_STAGE_IDS]);
  });

  it('maps each stage to its own counts', () => {
    const byId = new Map(stages.map((stage) => [stage.id, stage]));

    expect(byId.get('planner')).toMatchObject({ waiting: 0, active: 0, doneToday: 5 });
    expect(byId.get('researcher')).toMatchObject({ waiting: 5, active: 1, doneToday: 12 });
    expect(byId.get('writer')).toMatchObject({ waiting: 4, active: 6, doneToday: 13 });
    expect(byId.get('qc')).toMatchObject({ waiting: 7, active: 8, doneToday: 14 });
    expect(byId.get('reviewer')).toMatchObject({ waiting: 7, active: 9, doneToday: 15 });
    expect(byId.get('published')).toMatchObject({ waiting: 0, active: 0, doneToday: 10 });
  });

  it('maps bounced counts only to the researcher and writer stages', () => {
    const byId = new Map(stages.map((stage) => [stage.id, stage]));

    expect(byId.get('planner')?.bounced).toBe(0);
    expect(byId.get('researcher')?.bounced).toBe(2);
    expect(byId.get('writer')?.bounced).toBe(3);
    expect(byId.get('qc')?.bounced).toBe(0);
    expect(byId.get('reviewer')?.bounced).toBe(0);
    expect(byId.get('published')?.bounced).toBe(0);
  });

  it('places each agent in the stage for its role', () => {
    const byId = new Map(stages.map((stage) => [stage.id, stage]));

    expect(byId.get('planner')?.agents.map((agent) => agent.id)).toEqual(['planner-1']);
    expect(byId.get('researcher')?.agents.map((agent) => agent.id)).toEqual(['scrapper-1']);
    expect(byId.get('writer')?.agents.map((agent) => agent.id)).toEqual(['writer-1']);
    expect(byId.get('qc')?.agents.map((agent) => agent.id)).toEqual(['qc-1']);
    expect(byId.get('reviewer')?.agents.map((agent) => agent.id)).toEqual(['reviewer-1']);
  });

  it('gives the published stage no agents', () => {
    const published = stages.find((stage) => stage.id === 'published');

    expect(published?.agents).toEqual([]);
  });
});

interface FakeRow {
  [key: string]: unknown;
}

function createFakeDatabase(rowsFor: (sql: string) => FakeRow[] | null): {
  database: D1Database;
  queries: string[];
} {
  const queries: string[] = [];

  const database = {
    prepare(sql: string) {
      queries.push(sql);
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: rowsFor(sql) ?? [] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { database, queries };
}

describe('loadStageDetail', () => {
  it('returns null for an unknown stage without touching the database', async () => {
    const { database, queries } = createFakeDatabase(() => null);

    await expect(loadStageDetail(database, 'shipping')).resolves.toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('maps the researched topic queue for the writer stage', async () => {
    const { database } = createFakeDatabase((sql) => {
      if (sql.includes("status = 'researched'")) {
        return [
          {
            id: 'topic-1',
            title: 'Standing desk height',
            status: 'researched',
            updated_at: '2026-10-14T01:00:00.000Z',
          },
        ];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'writer');

    expect(detail?.stage.id).toBe('writer');
    expect(detail?.waitingItems).toEqual([
      {
        id: 'topic-1',
        title: 'Standing desk height',
        status: 'researched',
        updatedAt: '2026-10-14T01:00:00.000Z',
      },
    ]);
  });

  it('adds changes requested drafts after the researched topics and caps the list', async () => {
    const researched = Array.from({ length: 8 }, (_, index) => ({
      id: `topic-${index}`,
      title: `Topic ${index}`,
      status: 'researched',
      updated_at: '2026-10-14T01:00:00.000Z',
    }));

    const { database } = createFakeDatabase((sql) => {
      if (sql.includes("status = 'researched'")) {
        return researched;
      }
      if (sql.includes("review_status = 'changes_requested'")) {
        return [
          {
            id: 'draft-1',
            title: 'A draft sent back',
            status: 'changes_requested',
            updated_at: null,
          },
        ];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'writer');

    expect(detail?.waitingItems).toHaveLength(8);
    expect(detail?.waitingItems.some((waitingItem) => waitingItem.id === 'draft-1')).toBe(false);
  });

  it('fills the writer list with changes requested drafts when no topic is researched', async () => {
    const { database } = createFakeDatabase((sql) => {
      if (sql.includes("review_status = 'changes_requested'")) {
        return [
          {
            id: 'draft-1',
            title: 'A draft sent back',
            status: 'changes_requested',
            updated_at: null,
          },
        ];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'writer');

    expect(detail?.waitingItems).toEqual([
      { id: 'draft-1', title: 'A draft sent back', status: 'changes_requested', updatedAt: null },
    ]);
  });

  it('queries the queued, fetched, and blocked topics for the researcher stage', async () => {
    const { database, queries } = createFakeDatabase((sql) => {
      if (sql.includes("status IN ('queued', 'fetched', 'blocked')")) {
        return [{ id: 'topic-2', title: 'KVM switch', status: 'fetched', updated_at: null }];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'researcher');

    expect(detail?.waitingItems).toHaveLength(1);
    expect(queries.some((sql) => sql.includes("status IN ('queued', 'fetched', 'blocked')"))).toBe(
      true,
    );
  });

  it('maps run status and falls back to an unknown agent name', async () => {
    const { database } = createFakeDatabase((sql) => {
      if (sql.includes('LEFT JOIN agents a ON a.id = r.agent_id')) {
        return [
          {
            run_id: 'run-1',
            agent_name: null,
            status: 'failed',
            summary: 'Run failed',
            started_at: '2026-10-14T01:00:00.000Z',
            finished_at: '2026-10-14T01:01:00.000Z',
            tokens_out: 120,
          },
          {
            run_id: 'run-2',
            agent_name: 'Writer A',
            status: 'running',
            summary: null,
            started_at: '2026-10-14T02:00:00.000Z',
            finished_at: null,
            tokens_out: null,
          },
        ];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'writer');

    expect(detail?.recentRuns).toEqual([
      {
        runId: 'run-1',
        agentName: 'Unknown agent',
        status: 'failed',
        summary: 'Run failed',
        startedAt: '2026-10-14T01:00:00.000Z',
        finishedAt: '2026-10-14T01:01:00.000Z',
        tokensOut: 120,
      },
      {
        runId: 'run-2',
        agentName: 'Writer A',
        status: 'succeeded',
        summary: null,
        startedAt: '2026-10-14T02:00:00.000Z',
        finishedAt: null,
        tokensOut: null,
      },
    ]);
  });

  it('reports no recent runs for the published stage because no role owns it', async () => {
    const { database, queries } = createFakeDatabase((sql) => {
      if (sql.includes('AS updated_at')) {
        return [
          {
            id: 'post-1',
            title: 'A published article',
            status: 'published',
            updated_at: '2026-10-14T03:00:00.000Z',
          },
        ];
      }
      return null;
    });

    const detail = await loadStageDetail(database, 'published');

    expect(detail?.recentRuns).toEqual([]);
    expect(detail?.waitingItems).toHaveLength(1);
    expect(queries.some((sql) => sql.includes('LEFT JOIN agents a ON a.id = r.agent_id'))).toBe(
      false,
    );
  });
});
