import { describe, expect, it } from 'vitest';
import {
  AGENT_ROLE_DEFINITIONS,
  AGENT_ROLES,
  getRoleDefinition,
  isAgentModel,
  isAgentRole,
} from './roles';

describe('agent roles', () => {
  it('defines a complete entry for every role', () => {
    for (const role of AGENT_ROLES) {
      const definition = AGENT_ROLE_DEFINITIONS[role];
      expect(definition.id).toBe(role);
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.defaultPrompt.length).toBeGreaterThan(20);
    }
  });

  it('only allows the reviewer to auto publish', () => {
    expect(getRoleDefinition('reviewer').canAutoPublish).toBe(true);
    expect(getRoleDefinition('writer').canAutoPublish).toBe(false);
    expect(getRoleDefinition('qc').canAutoPublish).toBe(false);
    expect(getRoleDefinition('scrapper').canAutoPublish).toBe(false);
  });

  it('guards role and model values', () => {
    expect(isAgentRole('writer')).toBe(true);
    expect(isAgentRole('editor')).toBe(false);
    expect(isAgentModel('deepseek-flash')).toBe(true);
    expect(isAgentModel('gpt-4')).toBe(false);
  });
});
