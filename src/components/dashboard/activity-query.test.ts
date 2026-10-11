import { describe, expect, it } from 'vitest';
import {
  buildActivitySearchQuery,
  buildRetryToastMessage,
  formatAbsoluteTime,
  formatPaginationSummary,
  formatRangeLabel,
  hasActiveActivityFilters,
  initialsOf,
  parseActivityResponse,
  parseActorResponse,
  parseRetryResponse,
  parseRunDetailResponse,
  resolveRunStatusPresentation,
  resolveTargetHref,
  resolveTargetPresentation,
} from './activity-query';

const EMPTY_FILTERS = {
  scope: 'all' as const,
  actorId: '',
  action: '',
  targetType: '',
  search: '',
  since: '',
  until: '',
};

function queryOf(options: Parameters<typeof buildActivitySearchQuery>[0]): URLSearchParams {
  return new URLSearchParams(buildActivitySearchQuery(options));
}

describe('buildActivitySearchQuery', () => {
  it('returns only the page window when no filter is set', () => {
    const params = queryOf({ filters: EMPTY_FILTERS, page: 1, pageSize: 25 });

    expect(params.get('type')).toBeNull();
    expect(params.get('actor')).toBeNull();
    expect(params.get('action')).toBeNull();
    expect(params.get('targetType')).toBeNull();
    expect(params.get('q')).toBeNull();
    expect(params.get('since')).toBeNull();
    expect(params.get('until')).toBeNull();
    expect(params.get('limit')).toBe('25');
    expect(params.get('offset')).toBe('0');
  });

  it('maps every filter onto the endpoint parameter names', () => {
    const params = queryOf({
      filters: {
        scope: 'agent',
        actorId: 'agent-1',
        action: 'post.update',
        targetType: 'post',
        search: 'retry budget',
        since: '2026-03-01',
        until: '2026-03-09',
      },
      page: 1,
      pageSize: 25,
    });

    expect(params.get('type')).toBe('agent');
    expect(params.get('actor')).toBe('agent-1');
    expect(params.get('action')).toBe('post.update');
    expect(params.get('targetType')).toBe('post');
    expect(params.get('q')).toBe('retry budget');
    expect(params.get('since')).toBe('2026-03-01T00:00:00.000Z');
    expect(params.get('until')).toBe('2026-03-09T23:59:59.999Z');
  });

  it('turns the page number into a zero based offset', () => {
    expect(queryOf({ filters: EMPTY_FILTERS, page: 1, pageSize: 25 }).get('offset')).toBe('0');
    expect(queryOf({ filters: EMPTY_FILTERS, page: 2, pageSize: 25 }).get('offset')).toBe('25');
    expect(queryOf({ filters: EMPTY_FILTERS, page: 4, pageSize: 10 }).get('offset')).toBe('30');
  });
});

describe('formatRangeLabel', () => {
  it('reports the visible window and the total', () => {
    expect(formatRangeLabel(120, 2, 25, 25)).toBe('Showing 26 to 50 of 120');
  });

  it('reports a short last page by the entries actually loaded', () => {
    expect(formatRangeLabel(120, 5, 25, 20)).toBe('Showing 101 to 120 of 120');
  });

  it('says so when there is nothing to show', () => {
    expect(formatRangeLabel(0, 1, 25, 0)).toBe('No entries');
  });
});

describe('formatPaginationSummary', () => {
  it('reports the current page and the page count', () => {
    expect(formatPaginationSummary(120, 2, 25)).toBe('Page 2 of 5');
  });

  it('never reports a page beyond the page count', () => {
    expect(formatPaginationSummary(120, 9, 25)).toBe('Page 5 of 5');
  });

  it('reports a single page when there is nothing to paginate', () => {
    expect(formatPaginationSummary(0, 1, 25)).toBe('Page 1 of 1');
  });
});

describe('hasActiveActivityFilters', () => {
  it('is false only when every filter and the search are empty', () => {
    expect(hasActiveActivityFilters(EMPTY_FILTERS, '')).toBe(false);
  });

  it('is true for a scope, a search, or a date range', () => {
    expect(hasActiveActivityFilters({ ...EMPTY_FILTERS, scope: 'user' }, '')).toBe(true);
    expect(hasActiveActivityFilters(EMPTY_FILTERS, 'budget')).toBe(true);
    expect(hasActiveActivityFilters({ ...EMPTY_FILTERS, since: '2026-03-01' }, '')).toBe(true);
  });
});

describe('resolveTargetHref', () => {
  it('links a post, a page, and an agent to their edit screens', () => {
    expect(resolveTargetHref('post', 'post-1')).toBe('/dashboard/posts/post-1/edit');
    expect(resolveTargetHref('page', 'about')).toBe('/dashboard/pages/about/edit');
    expect(resolveTargetHref('agent', 'agent-1')).toBe('/dashboard/agents/agent-1/edit');
  });

  it('links types that only have a list screen to that screen', () => {
    expect(resolveTargetHref('redirect', 'redirect-1')).toBe('/dashboard/redirects');
    expect(resolveTargetHref('category', 'guides')).toBe('/dashboard/categories');
    expect(resolveTargetHref('affiliate_product', 'product-1')).toBe(
      '/dashboard/monetization/catalog',
    );
    expect(resolveTargetHref('affiliate_program', 'program-1')).toBe(
      '/dashboard/monetization/settings',
    );
  });

  it('encodes an id that contains a path separator', () => {
    expect(resolveTargetHref('post', 'draft/2026/a')).toBe(
      '/dashboard/posts/draft%2F2026%2Fa/edit',
    );
  });

  it('returns null for a type without a dashboard route', () => {
    expect(resolveTargetHref('share_job', 'job-1')).toBeNull();
    expect(resolveTargetHref('topic', 'topic-1')).toBeNull();
    expect(resolveTargetHref('source', 'note-1')).toBeNull();
    expect(resolveTargetHref(null, 'anything')).toBeNull();
  });

  it('returns null when the target id is missing', () => {
    expect(resolveTargetHref('post', null)).toBeNull();
    expect(resolveTargetHref('post', '')).toBeNull();
  });
});

describe('resolveTargetPresentation', () => {
  it('labels a linkable type as a link', () => {
    expect(resolveTargetPresentation('post')).toEqual({ label: 'Post', mode: 'link' });
  });

  it('labels a type without a route as text', () => {
    expect(resolveTargetPresentation('share_channel')).toEqual({
      label: 'Channel',
      mode: 'text',
    });
  });

  it('falls back to the raw value for an unrecorded type', () => {
    expect(resolveTargetPresentation('webhook')).toEqual({ label: 'webhook', mode: 'text' });
    expect(resolveTargetPresentation(null)).toEqual({ label: 'Entry', mode: 'text' });
  });
});

describe('resolveRunStatusPresentation', () => {
  it('maps each known status to a label and a badge', () => {
    expect(resolveRunStatusPresentation('succeeded')).toEqual({
      label: 'Succeeded',
      badge: 'default',
    });
    expect(resolveRunStatusPresentation('failed')).toEqual({
      label: 'Failed',
      badge: 'destructive',
    });
    expect(resolveRunStatusPresentation('running')).toEqual({
      label: 'Running',
      badge: 'secondary',
    });
    expect(resolveRunStatusPresentation('skipped')).toEqual({
      label: 'Skipped',
      badge: 'outline',
    });
  });

  it('marks an unrecognized status as unknown rather than guessing', () => {
    expect(resolveRunStatusPresentation('cancelled')).toEqual({
      label: 'Unknown',
      badge: 'outline',
    });
  });
});

describe('parseActivityResponse', () => {
  it('reads the entries, the total, and the action list', () => {
    const page = parseActivityResponse({
      activity: [
        {
          id: 'entry-1',
          actorId: 'agent-1',
          actorType: 'agent',
          actorLabel: 'Writer',
          action: 'agent.writer',
          targetType: 'post',
          targetId: 'post-1',
          summary: 'Drafted a guide',
          createdAt: '2026-03-04T10:00:00.000Z',
          runId: 'run-1',
          metadata: { tokensOut: 812 },
        },
      ],
      total: 42,
      actions: ['agent.writer', 'post.update'],
    });

    expect(page.total).toBe(42);
    expect(page.actions).toEqual(['agent.writer', 'post.update']);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toEqual({
      id: 'entry-1',
      actorId: 'agent-1',
      actorType: 'agent',
      actorLabel: 'Writer',
      action: 'agent.writer',
      targetType: 'post',
      targetId: 'post-1',
      summary: 'Drafted a guide',
      createdAt: '2026-03-04T10:00:00.000Z',
      runId: 'run-1',
      metadata: { tokensOut: 812 },
    });
  });

  it('drops an entry that is missing an id, a timestamp, or a summary', () => {
    const page = parseActivityResponse({
      activity: [
        { id: 'entry-1', createdAt: '2026-03-04T10:00:00.000Z', summary: 'Kept' },
        { id: 'entry-2', summary: 'No timestamp' },
        { actorLabel: 'No id' },
        'not an object',
      ],
      total: 4,
      actions: [],
    });

    expect(page.entries.map((entry) => entry.id)).toEqual(['entry-1']);
  });

  it('falls back to user actor, a null run, and null metadata', () => {
    const page = parseActivityResponse({
      activity: [{ id: 'entry-1', createdAt: '2026-03-04T10:00:00.000Z', summary: 'Updated' }],
      total: 1,
      actions: [],
    });

    expect(page.entries[0]?.actorType).toBe('user');
    expect(page.entries[0]?.runId).toBeNull();
    expect(page.entries[0]?.metadata).toBeNull();
  });

  it('returns an empty page for a malformed envelope', () => {
    expect(parseActivityResponse(null)).toEqual({ entries: [], total: 0, actions: [] });
    expect(parseActivityResponse({ activity: 'nope', total: 'many' })).toEqual({
      entries: [],
      total: 0,
      actions: [],
    });
  });
});

describe('parseActorResponse', () => {
  it('reads the actor list', () => {
    const actors = parseActorResponse({
      actors: [
        {
          id: 'agent-1',
          type: 'agent',
          label: 'Writer',
          activityCount: 12,
          lastActiveAt: '2026-03-04T10:00:00.000Z',
        },
      ],
    });

    expect(actors).toEqual([
      {
        id: 'agent-1',
        type: 'agent',
        label: 'Writer',
        activityCount: 12,
        lastActiveAt: '2026-03-04T10:00:00.000Z',
      },
    ]);
  });

  it('skips an actor without an id or a label', () => {
    const actors = parseActorResponse({
      actors: [{ id: 'agent-1', label: 'Writer' }, { label: 'No id' }, { id: 'user-1' }],
    });

    expect(actors.map((actor) => actor.id)).toEqual(['agent-1']);
  });

  it('returns an empty list for a malformed envelope', () => {
    expect(parseActorResponse({ actors: null })).toEqual([]);
  });
});

describe('parseRunDetailResponse', () => {
  it('reads the run, the agent, and the related activity', () => {
    const detail = parseRunDetailResponse({
      run: {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'failed',
        summary: 'Model call failed',
        output: 'partial output',
        tokensIn: 1200,
        tokensOut: 300,
        error: 'Upstream timeout',
        startedAt: '2026-03-04T10:00:00.000Z',
        finishedAt: '2026-03-04T10:02:00.000Z',
      },
      agent: { id: 'agent-1', name: 'Writer', role: 'writer' },
      activity: [{ id: 'entry-1', createdAt: '2026-03-04T10:02:00.000Z', summary: 'Failed' }],
    });

    expect(detail?.run.status).toBe('failed');
    expect(detail?.run.error).toBe('Upstream timeout');
    expect(detail?.run.tokensIn).toBe(1200);
    expect(detail?.agent).toEqual({ id: 'agent-1', name: 'Writer', role: 'writer' });
    expect(detail?.activity).toHaveLength(1);
  });

  it('keeps a run whose agent was deleted', () => {
    const detail = parseRunDetailResponse({
      run: {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'succeeded',
        startedAt: '2026-03-04T10:00:00.000Z',
      },
      agent: null,
      activity: [],
    });

    expect(detail?.agent).toBeNull();
    expect(detail?.run.status).toBe('succeeded');
    expect(detail?.run.summary).toBeNull();
  });

  it('rejects a payload without an identifiable run', () => {
    expect(parseRunDetailResponse({ run: { status: 'succeeded' } })).toBeNull();
    expect(parseRunDetailResponse({ agent: null })).toBeNull();
    expect(parseRunDetailResponse(null)).toBeNull();
  });
});

describe('parseRetryResponse', () => {
  it('reads the retried run result', () => {
    expect(
      parseRetryResponse({
        result: { runId: 'run-2', status: 'succeeded', summary: 'Drafted a guide' },
      }),
    ).toEqual({ runId: 'run-2', status: 'succeeded', summary: 'Drafted a guide' });
  });

  it('rejects a result without a summary', () => {
    expect(parseRetryResponse({ result: { runId: 'run-2', status: 'succeeded' } })).toBeNull();
    expect(parseRetryResponse(null)).toBeNull();
  });
});

describe('formatAbsoluteTime', () => {
  it('formats a timestamp with the date and the time', () => {
    expect(formatAbsoluteTime('2026-03-04T10:00:00.000Z')).toContain('2026');
  });

  it('reports a missing or invalid timestamp instead of an invalid date', () => {
    expect(formatAbsoluteTime(null)).toBe('Not recorded');
    expect(formatAbsoluteTime('')).toBe('Not recorded');
    expect(formatAbsoluteTime('not-a-timestamp')).toBe('Unknown time');
  });
});

describe('buildRetryToastMessage', () => {
  it('reports the summary the run returned', () => {
    expect(
      buildRetryToastMessage({ runId: 'run-1', status: 'succeeded', summary: 'Drafted a guide' }),
    ).toBe('Drafted a guide');
  });

  it('falls back to the status when the summary is empty', () => {
    expect(buildRetryToastMessage({ runId: 'run-1', status: 'skipped', summary: '   ' })).toBe(
      'Run finished with status Skipped.',
    );
  });
});

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('writer-1')).toBe('W1');
  });

  it('falls back to a placeholder for a label without words', () => {
    expect(initialsOf('  ')).toBe('?');
  });
});
