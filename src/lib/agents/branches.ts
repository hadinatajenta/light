import { ApiError } from '../errors';
import type { AgentRole } from './roles';

export type AgentRunBranch = 'analyst' | 'planner' | 'writer' | 'scrapper' | 'review';

export const AGENT_RUN_BRANCHES: Record<AgentRole, AgentRunBranch> = {
  analyst: 'analyst',
  planner: 'planner',
  writer: 'writer',
  scrapper: 'scrapper',
  reviewer: 'review',
  qc: 'review',
};

export const MODEL_TAIL_BRANCHES: readonly AgentRunBranch[] = ['writer', 'review'];

export function resolveAgentRunBranch(role: string): AgentRunBranch {
  const branch = (AGENT_RUN_BRANCHES as Record<string, AgentRunBranch | undefined>)[role];

  if (!branch) {
    throw new ApiError(500, 'UNKNOWN_AGENT_ROLE', `Agent role "${role}" has no run branch.`);
  }

  return branch;
}
