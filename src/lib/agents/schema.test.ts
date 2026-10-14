import { describe, expect, it } from 'vitest';
import { agentInputSchema } from './schema';

const BASE_INPUT = {
  name: 'Writer One',
  role: 'writer' as const,
  prompt: 'Draft home-office buying guides.',
  runsPerDay: 2,
  enabled: true,
  autoPublish: false,
};

describe('agentInputSchema', () => {
  it('accepts a DeepSeek agent with one of its own models', () => {
    const parsed = agentInputSchema.parse({
      ...BASE_INPUT,
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
    });

    expect(parsed.provider).toBe('deepseek');
    expect(parsed.model).toBe('deepseek-v4-pro');
  });

  it('accepts an OpenCode Go agent with one of its own models', () => {
    const parsed = agentInputSchema.parse({
      ...BASE_INPUT,
      provider: 'opencode-go',
      model: 'kimi-k3',
    });

    expect(parsed.provider).toBe('opencode-go');
    expect(parsed.model).toBe('kimi-k3');
  });

  it('accepts the shared DeepSeek models through OpenCode Go', () => {
    const parsed = agentInputSchema.parse({
      ...BASE_INPUT,
      provider: 'opencode-go',
      model: 'deepseek-flash',
    });

    expect(parsed.model).toBe('deepseek-flash');
  });

  it('rejects a model the chosen provider does not offer', () => {
    const result = agentInputSchema.safeParse({
      ...BASE_INPUT,
      provider: 'deepseek',
      model: 'kimi-k3',
    });

    expect(result.success).toBe(false);
    const issue = result.success
      ? null
      : result.error.issues.find((entry) => entry.path[0] === 'model');
    expect(issue?.message).toContain('DeepSeek');
  });

  it('defaults the provider to DeepSeek when the payload omits it', () => {
    const parsed = agentInputSchema.parse({
      ...BASE_INPUT,
      model: 'deepseek-flash',
    });

    expect(parsed.provider).toBe('deepseek');
  });

  it('still rejects an unknown role', () => {
    const result = agentInputSchema.safeParse({
      ...BASE_INPUT,
      role: 'editor',
      provider: 'deepseek',
      model: 'deepseek-flash',
    });

    expect(result.success).toBe(false);
  });
});
