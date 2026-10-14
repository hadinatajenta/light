export type StageId = 'planner' | 'researcher' | 'writer' | 'qc' | 'reviewer' | 'published';

export interface FlowAgent {
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
  id: StageId;
  label: string;
  description: string;
  waiting: number;
  active: number;
  doneToday: number;
  bounced: number;
  agents: FlowAgent[];
}

export interface AgentFlowSnapshot {
  generatedAt: string;
  stages: FlowStage[];
}

export interface StageWaitingItem {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
}

export interface StageRecentRun {
  runId: string;
  agentName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
  tokensOut: number | null;
}

export interface StageDetail {
  generatedAt: string;
  stage: FlowStage;
  waitingItems: StageWaitingItem[];
  recentRuns: StageRecentRun[];
}

export const ORDER_STAGE_IDS: StageId[] = [
  'planner',
  'researcher',
  'writer',
  'qc',
  'reviewer',
  'published',
];

export const STAGE_DETAIL_ENDPOINT = '/api/dashboard/agents/flow/stage';

export const STAGE_DETAIL_SHEET_ID = 'agent-flow-detail';
