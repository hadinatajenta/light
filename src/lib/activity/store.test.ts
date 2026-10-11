import { describe, expect, it } from 'vitest';
import { type ActivityQuery, buildActivityFilter, resolveActivityWindow } from './store';

const SEARCH_CONDITION = "(summary LIKE ? ESCAPE '\\' OR actor_label LIKE ? ESCAPE '\\')";

interface FilterCase {
  query: ActivityQuery;
  condition: string;
  binding: string;
}

describe('buildActivityFilter', () => {
  it('applies no conditions for an empty query', () => {
    expect(buildActivityFilter({})).toEqual({ where: '', bindings: [] });
  });

  it('ignores empty string filters', () => {
    expect(
      buildActivityFilter({
        actorId: '',
        actorType: undefined,
        action: '',
        targetType: '',
        targetId: '',
        runId: '',
        since: '',
        until: '',
        search: '',
      }),
    ).toEqual({ where: '', bindings: [] });
  });

  it('maps each filter to one condition and one binding', () => {
    const cases: FilterCase[] = [
      { query: { actorId: 'agent-1' }, condition: 'actor_id = ?', binding: 'agent-1' },
      { query: { actorType: 'agent' }, condition: 'actor_type = ?', binding: 'agent' },
      { query: { action: 'agent.writer' }, condition: 'action = ?', binding: 'agent.writer' },
      { query: { targetType: 'agent' }, condition: 'target_type = ?', binding: 'agent' },
      { query: { targetId: 'post-9' }, condition: 'target_id = ?', binding: 'post-9' },
      { query: { runId: 'run-9' }, condition: 'run_id = ?', binding: 'run-9' },
      {
        query: { since: '2026-10-01T00:00:00.000Z' },
        condition: 'created_at >= ?',
        binding: '2026-10-01T00:00:00.000Z',
      },
      {
        query: { until: '2026-10-12T00:00:00.000Z' },
        condition: 'created_at <= ?',
        binding: '2026-10-12T00:00:00.000Z',
      },
    ];

    for (const testCase of cases) {
      expect(buildActivityFilter(testCase.query)).toEqual({
        where: `WHERE ${testCase.condition}`,
        bindings: [testCase.binding],
      });
    }
  });

  it('combines every filter in a stable order', () => {
    expect(
      buildActivityFilter({
        actorId: 'agent-1',
        actorType: 'agent',
        action: 'agent.writer',
        targetType: 'post',
        targetId: 'post-9',
        runId: 'run-9',
        since: '2026-10-01T00:00:00.000Z',
        until: '2026-10-12T00:00:00.000Z',
        search: 'draft',
      }),
    ).toEqual({
      where: [
        'WHERE actor_id = ?',
        'actor_type = ?',
        'action = ?',
        'target_type = ?',
        'target_id = ?',
        'run_id = ?',
        'created_at >= ?',
        'created_at <= ?',
        SEARCH_CONDITION,
      ].join(' AND '),
      bindings: [
        'agent-1',
        'agent',
        'agent.writer',
        'post',
        'post-9',
        'run-9',
        '2026-10-01T00:00:00.000Z',
        '2026-10-12T00:00:00.000Z',
        '%draft%',
        '%draft%',
      ],
    });
  });

  it('binds the search pattern to both summary and actor label', () => {
    const filter = buildActivityFilter({ search: 'published post' });

    expect(filter.where).toBe(`WHERE ${SEARCH_CONDITION}`);
    expect(filter.bindings).toEqual(['%published post%', '%published post%']);
  });

  it('escapes percent, underscore and backslash in the search pattern', () => {
    expect(buildActivityFilter({ search: '100%' }).bindings[0]).toBe('%100\\%%');
    expect(buildActivityFilter({ search: 'a_b' }).bindings[0]).toBe('%a\\_b%');
    expect(buildActivityFilter({ search: 'c\\d' }).bindings[0]).toBe('%c\\\\d%');
    expect(buildActivityFilter({ search: '50%_off\\' }).bindings[0]).toBe('%50\\%\\_off\\\\%');
  });

  it('keeps the search term inside the escaped wildcards', () => {
    const [pattern] = buildActivityFilter({ search: '%' }).bindings;

    expect(pattern).toBe('%\\%%');
  });
});

describe('resolveActivityWindow', () => {
  it('defaults to fifty entries starting at zero', () => {
    expect(resolveActivityWindow({})).toEqual({ limit: 50, offset: 0 });
  });

  it('accepts explicit values inside the bounds', () => {
    expect(resolveActivityWindow({ limit: 1, offset: 0 })).toEqual({ limit: 1, offset: 0 });
    expect(resolveActivityWindow({ limit: 200, offset: 120 })).toEqual({
      limit: 200,
      offset: 120,
    });
  });

  it('clamps the limit to the supported range', () => {
    expect(resolveActivityWindow({ limit: 0 }).limit).toBe(1);
    expect(resolveActivityWindow({ limit: -5 }).limit).toBe(1);
    expect(resolveActivityWindow({ limit: 5000 }).limit).toBe(200);
  });

  it('floors fractional values and rejects negative offsets', () => {
    expect(resolveActivityWindow({ limit: 10.9, offset: 2.9 })).toEqual({
      limit: 10,
      offset: 2,
    });
    expect(resolveActivityWindow({ offset: -10 })).toEqual({ limit: 50, offset: 0 });
  });

  it('falls back to defaults for values that are not finite numbers', () => {
    expect(resolveActivityWindow({ limit: Number.NaN, offset: Number.NaN })).toEqual({
      limit: 50,
      offset: 0,
    });
    expect(resolveActivityWindow({ limit: Number.POSITIVE_INFINITY })).toEqual({
      limit: 50,
      offset: 0,
    });
  });
});
