import { describe, expect, it } from 'vitest';
import {
  buildCategoryFilter,
  countUnclaimedTopics,
  isDuplicateTopicTitle,
  isTopicClaimable,
  isTopicQueueFull,
  MAX_TOPIC_ATTEMPTS,
  MAX_UNCLAIMED_TOPICS,
  normalizeTopicTitle,
  type TopicCounts,
  topicRetryDelayMs,
} from './topics';

const NOW_ISO = '2026-10-11T08:00:00.000Z';
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function topicCounts(overrides: Partial<TopicCounts> = {}): TopicCounts {
  return {
    queued: 0,
    fetched: 0,
    researched: 0,
    inProgress: 0,
    used: 0,
    blocked: 0,
    dead: 0,
    ...overrides,
  };
}

describe('topic queue fullness', () => {
  it('counts every topic that still waits for an agent', () => {
    expect(countUnclaimedTopics(topicCounts({ queued: 2, fetched: 3, researched: 4 }))).toBe(9);
  });

  it('ignores topics an agent already claimed or closed', () => {
    expect(
      countUnclaimedTopics(topicCounts({ inProgress: 5, used: 6, blocked: 7, dead: 8, queued: 1 })),
    ).toBe(1);
  });

  it('keeps the queue open up to the limit', () => {
    expect(isTopicQueueFull(topicCounts({ queued: MAX_UNCLAIMED_TOPICS }))).toBe(false);
    expect(
      isTopicQueueFull(topicCounts({ fetched: MAX_UNCLAIMED_TOPICS - 1, researched: 1 })),
    ).toBe(false);
  });

  it('closes the queue above the limit', () => {
    expect(isTopicQueueFull(topicCounts({ queued: MAX_UNCLAIMED_TOPICS + 1 }))).toBe(true);
    expect(isTopicQueueFull(topicCounts({ queued: MAX_UNCLAIMED_TOPICS, researched: 1 }))).toBe(
      true,
    );
  });
});

describe('buildCategoryFilter', () => {
  it('matches any category for an empty list', () => {
    expect(buildCategoryFilter([])).toEqual({ clause: '', bindings: [] });
  });

  it('matches a single category', () => {
    expect(buildCategoryFilter(['chairs'])).toEqual({
      clause: ' AND category IN (?)',
      bindings: ['chairs'],
    });
  });

  it('matches several categories', () => {
    expect(buildCategoryFilter(['chairs', 'desk-setup', 'monitors'])).toEqual({
      clause: ' AND category IN (?, ?, ?)',
      bindings: ['chairs', 'desk-setup', 'monitors'],
    });
  });

  it('keeps the placeholder count equal to the binding count', () => {
    for (const categories of [[], ['a'], ['a', 'b'], ['a', 'b', 'c', 'd', 'e', 'f']]) {
      const filter = buildCategoryFilter(categories);
      const placeholders = filter.clause.match(/\?/g) ?? [];

      expect(placeholders).toHaveLength(categories.length);
      expect(filter.bindings).toHaveLength(categories.length);
    }
  });
});

describe('topicRetryDelayMs', () => {
  it('waits fifteen minutes after the first failure', () => {
    expect(topicRetryDelayMs(1)).toBe(FIFTEEN_MINUTES_MS);
  });

  it('waits one hour after the second failure', () => {
    expect(topicRetryDelayMs(2)).toBe(ONE_HOUR_MS);
  });

  it('keeps retrying while attempts remain below the cap', () => {
    for (let attempts = 1; attempts < MAX_TOPIC_ATTEMPTS; attempts += 1) {
      expect(topicRetryDelayMs(attempts)).not.toBeNull();
    }
  });

  it('stops retrying from the third failure onward', () => {
    expect(topicRetryDelayMs(MAX_TOPIC_ATTEMPTS)).toBeNull();
    expect(topicRetryDelayMs(MAX_TOPIC_ATTEMPTS + 1)).toBeNull();
    expect(topicRetryDelayMs(100)).toBeNull();
  });

  it('treats a missing or negative attempt count as terminal', () => {
    expect(topicRetryDelayMs(0)).toBeNull();
    expect(topicRetryDelayMs(-1)).toBeNull();
  });
});

describe('isTopicClaimable', () => {
  it('allows a queued topic that has no retry scheduled', () => {
    expect(isTopicClaimable('queued', null, NOW_ISO)).toBe(true);
  });

  it('allows a topic whose backoff window has passed', () => {
    expect(isTopicClaimable('researched', '2026-10-11T07:59:59.000Z', NOW_ISO)).toBe(true);
  });

  it('allows a topic exactly at the end of its backoff window', () => {
    expect(isTopicClaimable('fetched', NOW_ISO, NOW_ISO)).toBe(true);
  });

  it('blocks a topic inside its backoff window', () => {
    expect(isTopicClaimable('queued', '2026-10-11T08:15:00.000Z', NOW_ISO)).toBe(false);
  });

  it('rejects statuses that can no longer be claimed', () => {
    expect(isTopicClaimable('in_progress', null, NOW_ISO)).toBe(false);
    expect(isTopicClaimable('used', null, NOW_ISO)).toBe(false);
    expect(isTopicClaimable('blocked', null, NOW_ISO)).toBe(false);
    expect(isTopicClaimable('dead', null, NOW_ISO)).toBe(false);
  });
});

describe('normalizeTopicTitle', () => {
  it('lowercases the title', () => {
    expect(normalizeTopicTitle('Office Chair')).toBe('office chair');
  });

  it('turns punctuation into spaces and collapses whitespace', () => {
    expect(normalizeTopicTitle('  Standing   Desks: Which Fit?  ')).toBe(
      'standing desks which fit',
    );
  });

  it('keeps letters and numbers from any script', () => {
    expect(normalizeTopicTitle('Desk 2.0 (2026)')).toBe('desk 2 0 2026');
  });

  it('returns an empty string for punctuation only', () => {
    expect(normalizeTopicTitle(' -- ')).toBe('');
  });
});

describe('isDuplicateTopicTitle', () => {
  it('matches titles that differ only in case and punctuation', () => {
    expect(isDuplicateTopicTitle('Choosing an Office Chair!', ['choosing an office chair'])).toBe(
      true,
    );
  });

  it('matches titles that differ only in whitespace', () => {
    expect(isDuplicateTopicTitle('office   chair', ['office chair'])).toBe(true);
  });

  it('does not match genuinely different titles', () => {
    expect(isDuplicateTopicTitle('office chair height', ['office chair materials'])).toBe(false);
  });

  it('treats an empty candidate as not a duplicate', () => {
    expect(isDuplicateTopicTitle('   ', ['office chair'])).toBe(false);
  });

  it('returns false against an empty known list', () => {
    expect(isDuplicateTopicTitle('office chair', [])).toBe(false);
  });
});
