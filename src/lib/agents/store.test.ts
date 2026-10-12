import { describe, expect, it } from 'vitest';
import { AGENT_ROLES, MAX_AGENTS_BY_ROLE, MAX_RUNS_PER_DAY, MIN_RUNS_PER_DAY } from './roles';
import {
  computeNextRunAt,
  hasRepeatedFailures,
  MAX_AGENT_CATEGORIES,
  mergeWriterCategories,
  parseAgentCategories,
  serializeAgentCategories,
} from './store';

const FROM = new Date('2026-10-11T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

describe('computeNextRunAt', () => {
  it('spreads one run per day across a full day', () => {
    expect(computeNextRunAt(1, FROM)).toBe(new Date(FROM.getTime() + 24 * HOUR_MS).toISOString());
  });

  it('shortens the interval as runs per day grows', () => {
    expect(computeNextRunAt(4, FROM)).toBe(new Date(FROM.getTime() + 6 * HOUR_MS).toISOString());
    expect(computeNextRunAt(24, FROM)).toBe(new Date(FROM.getTime() + HOUR_MS).toISOString());
  });

  it('clamps values below one and above the cap', () => {
    expect(computeNextRunAt(0, FROM)).toBe(computeNextRunAt(1, FROM));
    expect(computeNextRunAt(1000, FROM)).toBe(computeNextRunAt(MAX_RUNS_PER_DAY, FROM));
  });

  it('supports the fifteen minute cadence at the cap', () => {
    expect(computeNextRunAt(MAX_RUNS_PER_DAY, FROM)).toBe(
      new Date(FROM.getTime() + 15 * 60 * 1000).toISOString(),
    );
  });

  it('schedules the claim past the claim time for every cadence', () => {
    for (let runsPerDay = MIN_RUNS_PER_DAY; runsPerDay <= MAX_RUNS_PER_DAY; runsPerDay += 1) {
      const nextRunAt = computeNextRunAt(runsPerDay, FROM);

      expect(new Date(nextRunAt).getTime()).toBeGreaterThan(FROM.getTime());
    }
  });
});

describe('hasRepeatedFailures', () => {
  it('detects three failed runs in a row', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed'])).toBe(true);
  });

  it('ignores a streak shorter than three runs', () => {
    expect(hasRepeatedFailures([])).toBe(false);
    expect(hasRepeatedFailures(['failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed'])).toBe(false);
  });

  it('breaks the streak when any run did not fail', () => {
    expect(hasRepeatedFailures(['failed', 'succeeded', 'failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'skipped'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'running'])).toBe(false);
  });

  it('requires exactly the three newest runs', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed', 'failed'])).toBe(false);
  });
});

describe('parseAgentCategories', () => {
  it('parses the stored JSON array form', () => {
    expect(parseAgentCategories('["desk-setup","chairs"]')).toEqual(['desk-setup', 'chairs']);
  });

  it('parses a plain comma separated string', () => {
    expect(parseAgentCategories('accessories, monitors, audio')).toEqual([
      'accessories',
      'monitors',
      'audio',
    ]);
  });

  it('trims entries and drops empties', () => {
    expect(parseAgentCategories('[" desk-setup ", "", "  ", "chairs"]')).toEqual([
      'desk-setup',
      'chairs',
    ]);
    expect(parseAgentCategories(' accessories , , monitors ')).toEqual(['accessories', 'monitors']);
  });

  it('de-duplicates repeated categories', () => {
    expect(parseAgentCategories('["chairs","desk-setup","chairs","desk-setup"]')).toEqual([
      'chairs',
      'desk-setup',
    ]);
  });

  it('caps the number of categories', () => {
    const many = '["a","b","c","d","e","f","g","h"]';

    expect(parseAgentCategories(many)).toHaveLength(MAX_AGENT_CATEGORIES);
    expect(parseAgentCategories(many)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns an empty array for unparseable input', () => {
    expect(parseAgentCategories('')).toEqual([]);
    expect(parseAgentCategories('   ')).toEqual([]);
    expect(parseAgentCategories(null)).toEqual([]);
    expect(parseAgentCategories(42)).toEqual([]);
    expect(parseAgentCategories('[1,2,3]')).toEqual([]);
    expect(parseAgentCategories('[not valid json')).toEqual([]);
  });

  it('keeps only string entries from a mixed array', () => {
    expect(parseAgentCategories('["chairs", 5, null, "chairs", ""]')).toEqual(['chairs']);
  });
});

describe('serializeAgentCategories', () => {
  it('round trips through parse', () => {
    const serialized = serializeAgentCategories(['chairs', 'desk-setup']);
    const parsed = JSON.parse(serialized);

    expect(serialized).toBe('["chairs","desk-setup"]');
    expect(parsed).toEqual(['chairs', 'desk-setup']);
    expect(parseAgentCategories(serialized)).toEqual(['chairs', 'desk-setup']);
  });

  it('normalizes before serializing', () => {
    expect(serializeAgentCategories([' chairs ', 'chairs', ''])).toBe('["chairs"]');
  });

  it('serializes an empty list', () => {
    expect(serializeAgentCategories([])).toBe('[]');
  });
});

describe('mergeWriterCategories', () => {
  it('flattens lists and keeps first-seen order', () => {
    expect(mergeWriterCategories([['chairs', 'audio'], ['desk-setup']])).toEqual([
      'chairs',
      'audio',
      'desk-setup',
    ]);
  });

  it('de-duplicates across writers', () => {
    expect(
      mergeWriterCategories([
        ['chairs', 'audio'],
        ['audio', 'chairs', 'monitors'],
      ]),
    ).toEqual(['chairs', 'audio', 'monitors']);
  });

  it('returns an empty array when nothing is configured', () => {
    expect(mergeWriterCategories([])).toEqual([]);
    expect(mergeWriterCategories([[], []])).toEqual([]);
  });

  it('ignores empty and whitespace-only entries', () => {
    expect(mergeWriterCategories([['', '  '], ['monitors']])).toEqual(['monitors']);
  });
});

describe('MAX_AGENTS_BY_ROLE', () => {
  it('caps writers at four and every other role at two', () => {
    expect(MAX_AGENTS_BY_ROLE.writer).toBe(4);
    expect(MAX_AGENTS_BY_ROLE.planner).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.scrapper).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.qc).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.reviewer).toBe(2);
  });

  it('defines a limit for every agent role', () => {
    for (const role of AGENT_ROLES) {
      expect(MAX_AGENTS_BY_ROLE[role]).toBeGreaterThan(0);
    }
  });
});
