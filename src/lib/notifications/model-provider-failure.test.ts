import { describe, expect, it } from 'vitest';
import { describeModelProviderFailure, isModelProviderFailureCode } from './model-provider-failure';

describe('isModelProviderFailureCode', () => {
  it('recognizes the codes that stop agent runs', () => {
    expect(isModelProviderFailureCode('MODEL_PROVIDER_INSUFFICIENT_BALANCE')).toBe(true);
    expect(isModelProviderFailureCode('MODEL_PROVIDER_UNAUTHORIZED')).toBe(true);
    expect(isModelProviderFailureCode('MODEL_PROVIDER_KEY_MISSING')).toBe(true);
    expect(isModelProviderFailureCode('MODEL_PROVIDER_RATE_LIMITED')).toBe(true);
  });

  it('ignores codes that belong to other failures', () => {
    expect(isModelProviderFailureCode('SEARCH_FAILED')).toBe(false);
    expect(isModelProviderFailureCode('MODEL_OUTPUT_INVALID')).toBe(false);
    expect(isModelProviderFailureCode('')).toBe(false);
  });
});

describe('describeModelProviderFailure', () => {
  it('names the missing balance as the cause', () => {
    expect(describeModelProviderFailure('MODEL_PROVIDER_INSUFFICIENT_BALANCE')).toContain(
      'no balance',
    );
  });

  it('names the rejected key as the cause', () => {
    expect(describeModelProviderFailure('MODEL_PROVIDER_UNAUTHORIZED')).toContain('rejected');
  });

  it('returns nothing for an unrelated code', () => {
    expect(describeModelProviderFailure('SEARCH_FAILED')).toBeNull();
  });
});
