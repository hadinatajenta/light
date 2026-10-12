import { describe, expect, it } from 'vitest';
import { withRunDeadline } from './run-deadline';

describe('withRunDeadline', () => {
  it('returns the operation result when it settles in time', async () => {
    await expect(withRunDeadline(Promise.resolve('ok'), 1_000, 'timeout')).resolves.toBe('ok');
  });

  it('returns the fallback when the operation hangs', async () => {
    const pending = new Promise<string>(() => {});

    await expect(withRunDeadline(pending, 20, 'abandoned')).resolves.toBe('abandoned');
  });

  it('propagates a rejection from the operation', async () => {
    await expect(
      withRunDeadline(Promise.reject(new Error('boom')), 1_000, 'timeout'),
    ).rejects.toThrow('boom');
  });
});
