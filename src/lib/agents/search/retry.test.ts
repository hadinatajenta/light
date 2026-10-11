import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors';
import { isRetryableSearchError, withSearchRetry } from './retry';

describe('isRetryableSearchError', () => {
  it('classifies transient provider errors as retryable', () => {
    expect(isRetryableSearchError(new ApiError(429, 'SEARCH_RATE_LIMITED', 'slow'))).toBe(true);
    expect(isRetryableSearchError(new ApiError(502, 'SEARCH_FAILED', 'boom'))).toBe(true);
    expect(isRetryableSearchError(new ApiError(502, 'SEARCH_UNREACHABLE', 'down'))).toBe(true);
  });

  it('does not retry an authorization error', () => {
    expect(isRetryableSearchError(new ApiError(401, 'SEARCH_UNAUTHORIZED', 'nope'))).toBe(false);
    expect(isRetryableSearchError(new Error('other'))).toBe(false);
  });
});

describe('withSearchRetry', () => {
  it('returns the first successful result', async () => {
    const operation = vi.fn(async () => 'ok');
    await expect(withSearchRetry(operation, { attempts: 3 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limited error and then succeeds', async () => {
    let calls = 0;
    const operation = vi.fn(async () => {
      calls += 1;
      if (calls < 2) {
        throw new ApiError(429, 'SEARCH_RATE_LIMITED', 'slow');
      }
      return 'ok';
    });

    await expect(withSearchRetry(operation, { attempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt limit', async () => {
    const operation = vi.fn(async () => {
      throw new ApiError(502, 'SEARCH_FAILED', 'boom');
    });

    await expect(withSearchRetry(operation, { attempts: 2, baseDelayMs: 1 })).rejects.toMatchObject(
      { code: 'SEARCH_FAILED' },
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const operation = vi.fn(async () => {
      throw new ApiError(401, 'SEARCH_UNAUTHORIZED', 'nope');
    });

    await expect(withSearchRetry(operation, { attempts: 3, baseDelayMs: 1 })).rejects.toMatchObject(
      { code: 'SEARCH_UNAUTHORIZED' },
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
