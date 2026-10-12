import { describe, expect, it } from 'vitest';
import {
  buildFlowStages,
  cadenceLabel,
  FLOW_STAGE_IDS,
  type FlowActivityCounts,
  type FlowAgentRef,
  type FlowCounts,
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
