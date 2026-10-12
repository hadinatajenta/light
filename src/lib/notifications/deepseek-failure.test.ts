import { describe, expect, it } from 'vitest';
import { describeDeepseekFailure, isDeepseekFailureCode } from './deepseek-failure';

describe('isDeepseekFailureCode', () => {
  it('recognizes the codes that stop agent runs', () => {
    expect(isDeepseekFailureCode('DEEPSEEK_INSUFFICIENT_BALANCE')).toBe(true);
    expect(isDeepseekFailureCode('DEEPSEEK_UNAUTHORIZED')).toBe(true);
    expect(isDeepseekFailureCode('DEEPSEEK_KEY_MISSING')).toBe(true);
    expect(isDeepseekFailureCode('DEEPSEEK_RATE_LIMITED')).toBe(true);
  });

  it('ignores codes that belong to other failures', () => {
    expect(isDeepseekFailureCode('SEARCH_FAILED')).toBe(false);
    expect(isDeepseekFailureCode('MODEL_OUTPUT_INVALID')).toBe(false);
    expect(isDeepseekFailureCode('')).toBe(false);
  });
});

describe('describeDeepseekFailure', () => {
  it('names the missing balance as the cause', () => {
    expect(describeDeepseekFailure('DEEPSEEK_INSUFFICIENT_BALANCE')).toContain('no balance');
  });

  it('names the rejected key as the cause', () => {
    expect(describeDeepseekFailure('DEEPSEEK_UNAUTHORIZED')).toContain('rejected');
  });

  it('returns nothing for an unrelated code', () => {
    expect(describeDeepseekFailure('SEARCH_FAILED')).toBeNull();
  });
});
