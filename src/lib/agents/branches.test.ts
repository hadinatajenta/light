import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { AGENT_RUN_BRANCHES, resolveAgentRunBranch } from './branches';
import { AGENT_ROLES } from './roles';

describe('resolveAgentRunBranch', () => {
  it('gives every declared agent role a terminal branch', () => {
    for (const role of AGENT_ROLES) {
      expect(Object.hasOwn(AGENT_RUN_BRANCHES, role)).toBe(true);
      expect(() => resolveAgentRunBranch(role)).not.toThrow();
    }

    expect(Object.keys(AGENT_RUN_BRANCHES).sort()).toEqual([...AGENT_ROLES].sort());
  });

  it('routes the analyst away from the model tail', () => {
    expect(resolveAgentRunBranch('analyst')).toBe('analyst');
  });

  it('routes qc and reviewer through the shared review branch', () => {
    expect(resolveAgentRunBranch('qc')).toBe('review');
    expect(resolveAgentRunBranch('reviewer')).toBe('review');
  });

  it('throws a terminal error for a role with no branch', () => {
    try {
      resolveAgentRunBranch('editor');
      throw new Error('expected resolveAgentRunBranch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
      expect((error as ApiError).code).toBe('UNKNOWN_AGENT_ROLE');
    }
  });
});
