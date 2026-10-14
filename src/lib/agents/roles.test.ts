import { describe, expect, it } from 'vitest';
import {
  AGENT_ROLE_DEFINITIONS,
  AGENT_ROLE_ORDER,
  AGENT_ROLES,
  getRoleDefinition,
  isAgentModel,
  isAgentRole,
  sortAgentsByRoleOrder,
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

  it('marks the analyst as the only model free system agent', () => {
    for (const role of AGENT_ROLES) {
      const definition = AGENT_ROLE_DEFINITIONS[role];

      if (role === 'analyst') {
        expect(definition.usesModel).toBe(false);
        expect(definition.systemManaged).toBe(true);
        expect(definition.canAutoPublish).toBe(false);
      } else {
        expect(definition.usesModel).toBe(true);
        expect(definition.systemManaged).toBe(false);
      }
    }
  });

  it('keeps the analyst out of the pipeline round order and sorts it last', () => {
    expect(AGENT_ROLE_ORDER).not.toContain('analyst');
    expect(sortAgentsByRoleOrder([{ role: 'analyst' }, { role: 'writer' }])).toEqual([
      { role: 'writer' },
      { role: 'analyst' },
    ]);
  });

  it('only allows the reviewer to auto publish', () => {
    expect(getRoleDefinition('reviewer').canAutoPublish).toBe(true);
    expect(getRoleDefinition('writer').canAutoPublish).toBe(false);
    expect(getRoleDefinition('qc').canAutoPublish).toBe(false);
    expect(getRoleDefinition('scrapper').canAutoPublish).toBe(false);
    expect(getRoleDefinition('planner').canAutoPublish).toBe(false);
    expect(getRoleDefinition('analyst').canAutoPublish).toBe(false);
  });

  it('guards role and model values', () => {
    expect(isAgentRole('writer')).toBe(true);
    expect(isAgentRole('analyst')).toBe(true);
    expect(isAgentRole('editor')).toBe(false);
    expect(isAgentModel('deepseek-flash')).toBe(true);
    expect(isAgentModel('gpt-4')).toBe(false);
  });
});
