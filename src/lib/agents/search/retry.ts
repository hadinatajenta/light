import { ApiError } from '../../errors';

const RETRYABLE_CODES = new Set(['SEARCH_RATE_LIMITED', 'SEARCH_FAILED', 'SEARCH_UNREACHABLE']);
const MAX_DELAY_MS = 8_000;
const RETRY_AFTER_CEILING_MS = 10_000;

export function isRetryableSearchError(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE_CODES.has(error.code);
}

function retryDelay(error: unknown, attempt: number, baseDelayMs: number): number {
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    const retryAfter = (error.details as { retryAfter?: unknown }).retryAfter;
    const seconds = typeof retryAfter === 'string' ? Number.parseInt(retryAfter, 10) : Number.NaN;
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, RETRY_AFTER_CEILING_MS);
    }
  }

  return Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SearchRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

export async function withSearchRetry<T>(
  operation: () => Promise<T>,
  options: SearchRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(options.attempts ?? 3, 1);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const isRetryable = options.isRetryable ?? isRetryableSearchError;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(retryDelay(error, attempt, baseDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('The search request failed.');
}
