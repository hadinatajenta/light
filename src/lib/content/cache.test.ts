import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateCache, readCache, writeCache } from './cache';

describe('cache', () => {
  afterEach(() => {
    vi.useRealTimers();
    invalidateCache('');
  });

  it('returns a stored value before it expires', () => {
    writeCache('value', 42, 1000);
    expect(readCache<number>('value')).toBe(42);
  });

  it('drops a value once the ttl has passed', () => {
    vi.useFakeTimers();
    writeCache('value', 42, 1000);
    vi.advanceTimersByTime(1001);
    expect(readCache<number>('value')).toBeNull();
  });

  it('returns null for a key that was never written', () => {
    expect(readCache<number>('missing')).toBeNull();
  });

  it('invalidates by prefix and leaves other keys intact', () => {
    writeCache('posts:list', 1, 1000);
    writeCache('media:list', 2, 1000);

    invalidateCache('posts');

    expect(readCache<number>('posts:list')).toBeNull();
    expect(readCache<number>('media:list')).toBe(2);
  });
});
