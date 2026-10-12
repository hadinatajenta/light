import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { MAX_PLANNED_TOPICS, parsePlannerTopics } from './planner';

const ALLOWED = ['chairs', 'desks'];
const KNOWN = ['Office Chair Height Guide'];

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'What Desk Depth Fits a Small Home Office',
    category: 'desks',
    intent: 'informational',
    keywords: ['desk depth small room', 'home office desk size'],
    rationale: 'Buyers rarely check depth before ordering.',
    ...overrides,
  };
}

describe('parsePlannerTopics', () => {
  it('accepts a valid entry and normalizes its fields', () => {
    const result = parsePlannerTopics({ topics: [validEntry()] }, ALLOWED, KNOWN);

    expect(result.skipped).toBe(0);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]).toEqual({
      title: 'What Desk Depth Fits a Small Home Office',
      category: 'desks',
      intent: 'informational',
      keywords: ['desk depth small room', 'home office desk size'],
    });
  });

  it('drops an entry whose category is not allowed', () => {
    const result = parsePlannerTopics(
      { topics: [validEntry({ category: 'monitors' })] },
      ALLOWED,
      KNOWN,
    );

    expect(result.topics).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('drops an entry whose title duplicates a known title', () => {
    const result = parsePlannerTopics(
      { topics: [validEntry({ title: 'office chair height guide!' })] },
      ALLOWED,
      KNOWN,
    );

    expect(result.topics).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('drops an entry that duplicates one already accepted in the same run', () => {
    const result = parsePlannerTopics(
      {
        topics: [
          validEntry({ title: 'Desk Depth Basics' }),
          validEntry({ title: 'desk depth basics' }),
        ],
      },
      ALLOWED,
      KNOWN,
    );

    expect(result.topics).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('falls back to informational when the intent is not recognised', () => {
    const result = parsePlannerTopics(
      { topics: [validEntry({ intent: 'buy-now' })] },
      ALLOWED,
      KNOWN,
    );

    expect(result.topics[0]?.intent).toBe('informational');
  });

  it('lowercases, trims, and de-duplicates keywords', () => {
    const result = parsePlannerTopics(
      { topics: [validEntry({ keywords: ['  Ergonomic ', 'OFFICE Chair', 'ergonomic'] })] },
      ALLOWED,
      KNOWN,
    );

    expect(result.topics[0]?.keywords).toEqual(['ergonomic', 'office chair']);
  });

  it('caps accepted topics at the per-run maximum', () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      validEntry({ title: `Desk topic number ${index}` }),
    );
    const result = parsePlannerTopics({ topics: entries }, ALLOWED, KNOWN);

    expect(result.topics).toHaveLength(MAX_PLANNED_TOPICS);
    expect(MAX_PLANNED_TOPICS).toBe(8);
  });

  it('rejects a payload without a non-empty topics array', () => {
    expect(() => parsePlannerTopics({}, ALLOWED, KNOWN)).toThrow(ApiError);
    expect(() => parsePlannerTopics({ topics: [] }, ALLOWED, KNOWN)).toThrow(ApiError);
  });

  it('tags the rejection with the invalid output code', () => {
    try {
      parsePlannerTopics({ topics: 'nope' }, ALLOWED, KNOWN);
      throw new Error('expected parsePlannerTopics to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('MODEL_OUTPUT_INVALID');
    }
  });
});
