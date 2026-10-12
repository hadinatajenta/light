import { describe, expect, it } from 'vitest';
import {
  buildScorecard,
  clampScorecardDays,
  type ScorecardAgent,
  type ScorecardRows,
  successRate,
  tokensPerArticle,
} from './scorecard';

const EMPTY_ROWS: ScorecardRows = { runs: [], topics: [], proposed: [], posts: [] };

function agent(overrides: Partial<ScorecardAgent> = {}): ScorecardAgent {
  return {
    id: 'agent-1',
    name: 'Guide writer',
    role: 'writer',
    categories: [],
    enabled: true,
    lastRunAt: null,
    ...overrides,
  };
}

describe('clampScorecardDays', () => {
  it('falls back to thirty days for a non-finite value', () => {
    expect(clampScorecardDays(Number.NaN)).toBe(30);
    expect(clampScorecardDays(Number.POSITIVE_INFINITY)).toBe(30);
  });

  it('clamps below the minimum to one day', () => {
    expect(clampScorecardDays(0)).toBe(1);
    expect(clampScorecardDays(-10)).toBe(1);
  });

  it('clamps above the maximum to a year', () => {
    expect(clampScorecardDays(366)).toBe(365);
    expect(clampScorecardDays(10_000)).toBe(365);
  });

  it('keeps in-range values and floors fractions', () => {
    expect(clampScorecardDays(1)).toBe(1);
    expect(clampScorecardDays(30)).toBe(30);
    expect(clampScorecardDays(365)).toBe(365);
    expect(clampScorecardDays(7.9)).toBe(7);
  });
});

describe('successRate', () => {
  it('returns zero when there are no runs', () => {
    expect(successRate(0, 0)).toBe(0);
  });

  it('divides ok runs by total runs', () => {
    expect(successRate(8, 10)).toBe(0.8);
    expect(successRate(3, 4)).toBe(0.75);
  });

  it('returns zero when nothing succeeded out of many runs', () => {
    expect(successRate(0, 7)).toBe(0);
  });
});

describe('tokensPerArticle', () => {
  it('returns null when no articles were produced', () => {
    expect(tokensPerArticle(1200, 0)).toBeNull();
    expect(tokensPerArticle(0, 0)).toBeNull();
  });

  it('divides tokens by articles', () => {
    expect(tokensPerArticle(100, 4)).toBe(25);
    expect(tokensPerArticle(0, 3)).toBe(0);
  });
});

describe('buildScorecard', () => {
  it('returns zeros for an agent with no rows at all', () => {
    const scorecard = buildScorecard(agent(), EMPTY_ROWS);

    expect(scorecard.runsTotal).toBe(0);
    expect(scorecard.runsOk).toBe(0);
    expect(scorecard.runsFailed).toBe(0);
    expect(scorecard.successRate).toBe(0);
    expect(scorecard.tokensIn).toBe(0);
    expect(scorecard.tokensOut).toBe(0);
    expect(scorecard.topicsClaimed).toBe(0);
    expect(scorecard.topicsProposed).toBe(0);
    expect(scorecard.articlesUsed).toBe(0);
    expect(scorecard.postsReviewed).toBe(0);
    expect(scorecard.tokensPerArticle).toBeNull();
    expect(scorecard.lastRunAt).toBeNull();
  });

  it('merges matching rows and ignores other agents', () => {
    const rows: ScorecardRows = {
      runs: [
        { agentId: 'agent-1', status: 'succeeded', total: 6, tokensIn: 600, tokensOut: 900 },
        { agentId: 'agent-1', status: 'failed', total: 2, tokensIn: 100, tokensOut: 50 },
        { agentId: 'agent-1', status: 'skipped', total: 1, tokensIn: 0, tokensOut: 0 },
        { agentId: 'agent-2', status: 'succeeded', total: 99, tokensIn: 999, tokensOut: 999 },
      ],
      topics: [
        { agentId: 'agent-1', claimed: 5, used: 4 },
        { agentId: 'agent-9', claimed: 40, used: 40 },
      ],
      proposed: [
        { agentId: 'agent-1', proposed: 3 },
        { agentId: 'agent-9', proposed: 12 },
      ],
      posts: [
        { agentId: 'agent-1', reviewed: 7, approved: 5, revisionsRequested: 2 },
        { agentId: 'agent-9', reviewed: 30, approved: 30, revisionsRequested: 0 },
      ],
    };

    const scorecard = buildScorecard(agent({ lastRunAt: '2026-10-12T08:00:00.000Z' }), rows);

    expect(scorecard.runsTotal).toBe(9);
    expect(scorecard.runsOk).toBe(6);
    expect(scorecard.runsFailed).toBe(2);
    expect(scorecard.successRate).toBeCloseTo(6 / 9);
    expect(scorecard.tokensIn).toBe(700);
    expect(scorecard.tokensOut).toBe(950);
    expect(scorecard.topicsClaimed).toBe(5);
    expect(scorecard.articlesUsed).toBe(4);
    expect(scorecard.topicsProposed).toBe(3);
    expect(scorecard.postsReviewed).toBe(7);
    expect(scorecard.postsApproved).toBe(5);
    expect(scorecard.revisionsRequested).toBe(2);
    expect(scorecard.tokensPerArticle).toBe(1650 / 4);
    expect(scorecard.lastRunAt).toBe('2026-10-12T08:00:00.000Z');
  });

  it('carries identity fields and disables tokens per article without articles', () => {
    const scorecard = buildScorecard(
      agent({
        id: 'agent-7',
        name: 'Reviewer',
        role: 'reviewer',
        categories: ['home-office'],
        enabled: false,
      }),
      {
        ...EMPTY_ROWS,
        runs: [{ agentId: 'agent-7', status: 'succeeded', total: 1, tokensIn: 10, tokensOut: 20 }],
      },
    );

    expect(scorecard.agentId).toBe('agent-7');
    expect(scorecard.name).toBe('Reviewer');
    expect(scorecard.role).toBe('reviewer');
    expect(scorecard.categories).toEqual(['home-office']);
    expect(scorecard.enabled).toBe(false);
    expect(scorecard.tokensPerArticle).toBeNull();
  });
});
