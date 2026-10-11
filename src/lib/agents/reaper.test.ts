import { describe, expect, it } from 'vitest';
import { isRunActive, STALE_RUN_MS, staleRunCutoff, topicStatusAfterInterruption } from './reaper';

const NOW = new Date('2026-10-11T08:00:00.000Z').getTime();

describe('staleRunCutoff', () => {
  it('returns the moment before which a run counts as stale', () => {
    expect(staleRunCutoff(NOW)).toBe(new Date(NOW - STALE_RUN_MS).toISOString());
  });

  it('accepts an explicit window', () => {
    expect(staleRunCutoff(NOW, 60_000)).toBe(new Date(NOW - 60_000).toISOString());
  });

  it('puts a run that started eight hours ago in the past', () => {
    const startedAt = new Date(NOW - 8 * 60 * 60 * 1000).toISOString();

    expect(startedAt < staleRunCutoff(NOW)).toBe(true);
  });

  it('keeps a run that started one minute ago out of the stale set', () => {
    const startedAt = new Date(NOW - 60_000).toISOString();

    expect(startedAt < staleRunCutoff(NOW)).toBe(false);
  });
});

describe('topicStatusAfterInterruption', () => {
  it('sends a writer back to the researched queue', () => {
    expect(topicStatusAfterInterruption('writer')).toBe('researched');
  });

  it('sends every other role back to the plain queue', () => {
    expect(topicStatusAfterInterruption('scrapper')).toBe('queued');
    expect(topicStatusAfterInterruption('reviewer')).toBe('queued');
    expect(topicStatusAfterInterruption('unknown')).toBe('queued');
  });
});

describe('isRunActive', () => {
  it('keeps a run that started one minute ago active', () => {
    expect(isRunActive(new Date(NOW - 60_000).toISOString(), new Date(NOW))).toBe(true);
  });

  it('lets a run that started eight hours ago be reaped', () => {
    expect(isRunActive(new Date(NOW - 8 * 60 * 60 * 1000).toISOString(), new Date(NOW))).toBe(
      false,
    );
  });

  it('treats a run exactly at the stale cutoff as active', () => {
    expect(isRunActive(staleRunCutoff(NOW), new Date(NOW))).toBe(true);
  });
});
