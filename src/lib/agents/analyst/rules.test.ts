import { describe, expect, it } from 'vitest';
import type { AffiliateProgram } from '@/config/monetization';
import type { AnalystConfig } from './config';
import {
  ANALYST_NEW_TOPIC_QUEUE_LIMIT,
  ANALYST_PRIZE_CLICK_CAP,
  ANALYST_RULE_FINDING_CAP,
  type AnalystCandidateDraft,
  averagePosition,
  candidateScore,
  classifyProductResolution,
  classifyProgramProblem,
  clickThroughRate,
  countProductLinks,
  expectedClickRate,
  expectedClicks,
  findBrokenPlacementCandidates,
  findDeadTargetCandidates,
  findingMapKey,
  findNewTopicCandidates,
  findNoAffiliateLinkCandidates,
  findRedirectMissCandidates,
  findRefreshCandidates,
  findTitleMetaCandidates,
  findZeroCommissionCandidates,
  findZeroViewCandidates,
  postAgeDays,
  rankDrafts,
  runAnalystRules,
} from './rules';
import type {
  AnalystData,
  AnalystGscPageSource,
  AnalystPostSource,
  AnalystProductSource,
} from './sources';
import { resolveAnalystWindow } from './window';

const CONFIG: AnalystConfig = {
  noLinkMinViewsShare: 0.02,
  noLinkMinViewsFloor: 3,
  brokenPlacementMinClicks: 1,
  redirectMissMinCount: 2,
  zeroViewsMinAgeDays: 30,
  zeroViewsMaxFindings: 1,
  gscMinImpressions: 20,
  gscMinPageAgeDays: 30,
  titleMetaMaxPosition: 10,
  titleMetaMaxCtr: 0.02,
  refreshMinPosition: 10,
  refreshMinAgeDays: 60,
  newTopicMinImpressions: 10,
  productCheckMinClicks: 3,
};

const WINDOW = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

function program(overrides: Partial<AffiliateProgram> = {}): AffiliateProgram {
  return {
    id: 'amazon',
    name: 'Amazon Associates',
    network: 'amazon',
    trackingId: 'tag-20',
    linkTemplate: 'https://example.com/dp/{target}?tag={trackingId}',
    status: 'approved',
    disclosure: '',
    ...overrides,
  };
}

function product(overrides: Partial<AnalystProductSource> = {}): AnalystProductSource {
  return {
    slug: 'office-chair',
    name: 'Office Chair',
    target: 'B0TEST',
    isActive: true,
    topics: ['chairs'],
    program: program(),
    clicks: 0,
    orders: 0,
    commissionCents: 0,
    ...overrides,
  };
}

function post(overrides: Partial<AnalystPostSource> = {}): AnalystPostSource {
  return {
    id: 'chair-guide',
    title: 'Chair Guide',
    category: 'chairs',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    body: 'A guide without links.',
    views: 10,
    baselineViews: 5,
    productSlugs: [],
    ...overrides,
  };
}

function page(overrides: Partial<AnalystGscPageSource> = {}): AnalystGscPageSource {
  return {
    postId: 'chair-guide',
    impressions: 100,
    clicks: 0,
    positionSum: 300,
    ...overrides,
  };
}

function data(overrides: Partial<AnalystData> = {}): AnalystData {
  return {
    posts: [],
    products: [],
    redirectMisses: [],
    totals: { views: 100, clicks: 10, publishedPosts: 0 },
    gsc: { pages: [], queries: [], rankedQueries: [], unmappedPages: [], truncated: [] },
    commissionCoverage: 'unknown',
    ...overrides,
  };
}

describe('candidate scoring', () => {
  it('is deterministic and round to an integer', () => {
    const input = { impact: 3, confidence: 0.9, prizeClicks: 2.4, actionEffort: 'M' as const };

    expect(candidateScore(input)).toBe(candidateScore(input));
    expect(candidateScore(input)).toBe(92);
  });

  it('caps prize clicks so a single spike cannot dominate', () => {
    const capped = candidateScore({
      impact: 3,
      confidence: 1,
      prizeClicks: ANALYST_PRIZE_CLICK_CAP,
      actionEffort: 'M',
    });
    const beyond = candidateScore({
      impact: 3,
      confidence: 1,
      prizeClicks: 10_000,
      actionEffort: 'M',
    });

    expect(capped).toBe(beyond);
  });

  it('rewards cheap actions over expensive ones', () => {
    const base = { impact: 2, confidence: 0.8, prizeClicks: 1 };

    expect(candidateScore({ ...base, actionEffort: 'S' })).toBeGreaterThan(
      candidateScore({ ...base, actionEffort: 'M' }),
    );
    expect(candidateScore({ ...base, actionEffort: 'M' })).toBeGreaterThan(
      candidateScore({ ...base, actionEffort: 'L' }),
    );
  });

  it('derives a click rate and expected clicks from site totals', () => {
    expect(expectedClickRate(0, 10)).toBe(0);
    expect(expectedClickRate(200, 20)).toBe(0.1);
    expect(expectedClicks(15, 0.1)).toBe(1.5);
    expect(expectedClicks(0, 0.1)).toBe(0);
  });
});

describe('countProductLinks', () => {
  it('counts markdown product references only', () => {
    expect(countProductLinks('See [a](product:one) and [b](product:two).')).toBe(2);
    expect(countProductLinks('product:one without a link')).toBe(0);
    expect(countProductLinks('plain text')).toBe(0);
  });
});

describe('classifyProductResolution', () => {
  it('returns null for a product that resolves', () => {
    expect(classifyProductResolution(product())).toBeNull();
  });

  it('names every unresolvable case', () => {
    expect(classifyProductResolution(undefined)).toBe('missing_product');
    expect(classifyProductResolution(product({ isActive: false }))).toBe('inactive_product');
    expect(classifyProductResolution(product({ program: null }))).toBe('missing_program');
    expect(classifyProductResolution(product({ program: program({ status: 'pending' }) }))).toBe(
      'program_not_approved',
    );
    expect(classifyProductResolution(product({ program: program({ trackingId: null }) }))).toBe(
      'tracking_id_empty',
    );
    expect(classifyProductResolution(product({ target: 'not a safe target' }))).toBe(
      'link_invalid',
    );
  });

  it('treats a paused program as not approved', () => {
    expect(classifyProgramProblem(product({ program: program({ status: 'paused' }) }))).toBe(
      'program_not_approved',
    );
  });
});

describe('findNoAffiliateLinkCandidates', () => {
  it('skips posts under the threshold and posts that already link products', () => {
    const candidates = findNoAffiliateLinkCandidates({
      data: data({
        posts: [
          post({ id: 'quiet', views: 2 }),
          post({ id: 'linked', views: 50, body: '[chair](product:office-chair)' }),
          post({ id: 'candidate', views: 4 }),
        ],
        products: [product()],
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['candidate']);
  });

  it('raises the floor with the share of total views', () => {
    const candidates = findNoAffiliateLinkCandidates({
      data: data({
        posts: [post({ id: 'small', views: 4 }), post({ id: 'big', views: 40 })],
        products: [product()],
        totals: { views: 1_000, clicks: 20, publishedPosts: 2 },
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['big']);
  });

  it('requires an active product in the post category', () => {
    const candidates = findNoAffiliateLinkCandidates({
      data: data({
        posts: [
          post({ id: 'chairs-post', category: 'chairs' }),
          post({ id: 'audio-post', category: 'audio' }),
        ],
        products: [
          product({ topics: ['chairs'] }),
          product({ slug: 'dead', topics: ['audio'], isActive: false }),
        ],
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['chairs-post']);
  });

  it('stores the thresholds and the raw numbers in the evidence', () => {
    const candidates = findNoAffiliateLinkCandidates({
      data: data({
        posts: [post({ views: 20, baselineViews: 5 })],
        products: [product()],
        totals: { views: 100, clicks: 10, publishedPosts: 1 },
      }),
      config: CONFIG,
    });

    const candidate = candidates[0];

    expect(candidate?.actionType).toBe('add_links');
    expect(candidate?.actionEffort).toBe('M');
    expect(candidate?.prizeClicks).toBe(2);
    expect(candidate?.evidence).toMatchObject({
      rule: 'no_affiliate_link',
      views: 20,
      totalViews: 100,
      totalClicks: 10,
      minViews: 3,
      thresholds: { share: 0.02, floor: 3 },
      expectedClickRate: 0.1,
      prizeClicks: 2,
    });
  });

  it('ranks by views and then by id', () => {
    const candidates = findNoAffiliateLinkCandidates({
      data: data({
        posts: [
          post({ id: 'b', views: 10 }),
          post({ id: 'a', views: 10 }),
          post({ id: 'c', views: 30 }),
        ],
        products: [product()],
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['c', 'a', 'b']);
  });
});

describe('findDeadTargetCandidates', () => {
  it('reports each reference that cannot resolve with its reason', () => {
    const candidates = findDeadTargetCandidates({
      data: data({
        posts: [
          post({
            id: 'guide',
            body: '[a](product:missing) [b](product:inactive) [c](product:pending) [d](product:office-chair)',
            productSlugs: ['missing', 'inactive', 'pending', 'office-chair'],
          }),
        ],
        products: [
          product({ slug: 'inactive', isActive: false }),
          product({ slug: 'pending', program: program({ status: 'pending' }) }),
          product(),
        ],
      }),
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual([
      'guide:inactive',
      'guide:missing',
      'guide:pending',
    ]);
    expect(
      candidates.find((candidate) => candidate.findingKey === 'guide:missing')?.evidence,
    ).toMatchObject({
      rule: 'dead_target',
      slug: 'missing',
      problem: 'the product row does not exist',
      views: 10,
    });
    expect(candidates.find((candidate) => candidate.findingKey === 'guide:active')).toBeUndefined();
  });

  it('ignores references that resolve', () => {
    const candidates = findDeadTargetCandidates({
      data: data({
        posts: [post({ body: '[a](product:office-chair)', productSlugs: ['office-chair'] })],
        products: [product()],
      }),
    });

    expect(candidates).toEqual([]);
  });
});

describe('findBrokenPlacementCandidates', () => {
  it('needs at least one click and a program that cannot pay', () => {
    const candidates = findBrokenPlacementCandidates({
      data: data({
        products: [
          product({ slug: 'zero-clicks', program: program({ status: 'pending' }), clicks: 0 }),
          product({ slug: 'paid', clicks: 5 }),
          product({ slug: 'pending', program: program({ status: 'pending' }), clicks: 2 }),
          product({ slug: 'untracked', program: program({ trackingId: null }), clicks: 3 }),
          product({ slug: 'orphan', program: null, clicks: 1 }),
        ],
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual([
      'untracked',
      'pending',
      'orphan',
    ]);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'broken_placement',
      clicks: 3,
      minClicks: 1,
      problem: 'the program has no tracking id',
    });
  });
});

describe('findRedirectMissCandidates', () => {
  it('filters by the minimum count and keeps the referrers in evidence', () => {
    const candidates = findRedirectMissCandidates({
      data: data({
        redirectMisses: [
          { slug: 'rare', missCount: 1, referrerPaths: ['/a'] },
          { slug: 'chair', missCount: 3, referrerPaths: ['/a', '/b'] },
          { slug: 'lamp', missCount: 5, referrerPaths: ['/c'] },
        ],
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['lamp', 'chair']);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'redirect_misses',
      slug: 'lamp',
      missCount: 5,
      minCount: 2,
      referrerPaths: ['/c'],
    });
  });
});

describe('postAgeDays', () => {
  it('measures age against the window end', () => {
    expect(postAgeDays('2026-01-01T00:00:00.000Z', '2026-03-14')).toBe(72);
    expect(postAgeDays(null, '2026-03-14')).toBeNull();
    expect(postAgeDays('not a date', '2026-03-14')).toBeNull();
  });
});

describe('findZeroViewCandidates', () => {
  it('only reports old posts with no views in the window', () => {
    const candidates = findZeroViewCandidates({
      data: data({
        posts: [
          post({ id: 'old', publishedAt: '2025-12-01T00:00:00.000Z', views: 0 }),
          post({ id: 'recent', publishedAt: '2026-03-01T00:00:00.000Z', views: 0 }),
          post({ id: 'seen', publishedAt: '2025-12-01T00:00:00.000Z', views: 4 }),
          post({ id: 'undated', publishedAt: null, views: 0 }),
        ],
      }),
      config: CONFIG,
      window: WINDOW,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['old']);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'zero_views',
      ageDays: 103,
      minAgeDays: 30,
      views: 0,
    });
  });

  it('prefers the oldest posts when ranking', () => {
    const candidates = findZeroViewCandidates({
      data: data({
        posts: [
          post({ id: 'newer', publishedAt: '2025-12-15T00:00:00.000Z', views: 0 }),
          post({ id: 'older', publishedAt: '2025-01-01T00:00:00.000Z', views: 0 }),
        ],
      }),
      config: CONFIG,
      window: WINDOW,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['older', 'newer']);
  });
});

describe('rankDrafts', () => {
  it('caps the ranked output and keeps input order on ties', () => {
    const drafts: AnalystCandidateDraft[] = Array.from({ length: 5 }, (_, index) => ({
      ruleId: 'no_affiliate_link' as const,
      findingKey: `post-${index}`,
      subjectType: 'post' as const,
      subjectId: `post-${index}`,
      title: 'Title',
      detail: 'Detail',
      actionType: 'add_links' as const,
      actionEffort: 'M' as const,
      impact: 3,
      confidence: 0.9,
      prizeClicks: 1,
      evidence: { index },
    }));

    const ranked = rankDrafts(drafts, 3);

    expect(ranked.map((draft) => draft.findingKey)).toEqual(['post-0', 'post-1', 'post-2']);
  });
});

describe('runAnalystRules', () => {
  it('caps each rule but keeps every present key for expiry tracking', () => {
    const posts = Array.from({ length: 5 }, (_, index) =>
      post({ id: `post-${index}`, views: 100 - index }),
    );
    const run = runAnalystRules({
      data: data({ posts, products: [product()] }),
      config: CONFIG,
      window: WINDOW,
      dataQuality: { clicks: 'ok' },
    });

    expect(run.candidates).toHaveLength(ANALYST_RULE_FINDING_CAP);
    expect(run.presentKeys).toHaveLength(5);
    expect(run.candidates.every((candidate) => candidate.dataQuality.clicks === 'ok')).toBe(true);
  });

  it('applies the zero views cap from the config', () => {
    const posts = Array.from({ length: 4 }, (_, index) =>
      post({ id: `old-${index}`, publishedAt: '2025-01-01T00:00:00.000Z', views: 0 }),
    );
    const run = runAnalystRules({
      data: data({ posts }),
      config: { ...CONFIG, zeroViewsMaxFindings: 1 },
      window: WINDOW,
      dataQuality: {},
    });

    expect(run.candidates).toHaveLength(1);
    expect(run.presentKeys).toHaveLength(4);
  });

  it('emits keys that identify a finding by rule and key', () => {
    expect(findingMapKey('dead_target', 'guide:chair')).toBe('dead_target:guide:chair');
  });

  it('keeps one finding per page when refresh and title meta both match', () => {
    const run = runAnalystRules({
      data: data({
        posts: [
          post({ id: 'buried', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'snippet', publishedAt: '2025-01-01T00:00:00.000Z' }),
        ],
        gsc: {
          pages: [
            page({ postId: 'buried', impressions: 200, clicks: 1, positionSum: 3_000 }),
            page({ postId: 'snippet', impressions: 200, clicks: 1, positionSum: 800 }),
          ],
          queries: [],
          rankedQueries: [],
          unmappedPages: [],
          truncated: [],
        },
      }),
      config: CONFIG,
      window: WINDOW,
      dataQuality: {},
    });

    expect(
      run.candidates.map((candidate) => `${candidate.ruleId}:${candidate.findingKey}`),
    ).toEqual(['refresh:buried', 'refresh:snippet']);
    expect(run.presentKeys).toContain('refresh:buried');
    expect(run.presentKeys).toContain('refresh:snippet');
    expect(run.presentKeys).not.toContain('title_meta:snippet');
  });

  it('passes the planner queue state into the new topic rule', () => {
    const query = { query: 'best standing desk', impressions: 50, clicks: 1, positionSum: 200 };
    const run = runAnalystRules({
      data: data({
        gsc: { pages: [], queries: [query], rankedQueries: [], unmappedPages: [], truncated: [] },
      }),
      config: CONFIG,
      window: WINDOW,
      dataQuality: {},
      openNewTopicFindings: ANALYST_NEW_TOPIC_QUEUE_LIMIT,
    });

    expect(run.candidates).toEqual([]);
    expect(run.presentKeys).toContain('new_topic:best standing desk');
  });
});

describe('search driven helpers', () => {
  it('derives position and click through rate from the sums', () => {
    expect(averagePosition(0, 0)).toBe(0);
    expect(averagePosition(41.5, 10)).toBeCloseTo(4.15);
    expect(clickThroughRate(3, 0)).toBe(0);
    expect(clickThroughRate(3, 300)).toBeCloseTo(0.01);
  });
});

describe('findTitleMetaCandidates', () => {
  it('needs impressions, a ranking position, a low ctr, and an aged page', () => {
    const candidates = findTitleMetaCandidates({
      data: data({
        posts: [
          post({ id: 'low-impressions', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'too-buried', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'young', publishedAt: '2026-03-10T00:00:00.000Z' }),
          post({ id: 'clicked', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'candidate', publishedAt: '2025-01-01T00:00:00.000Z' }),
        ],
        gsc: {
          pages: [
            page({ postId: 'low-impressions', impressions: 5, clicks: 0, positionSum: 20 }),
            page({ postId: 'too-buried', impressions: 100, clicks: 0, positionSum: 1_500 }),
            page({ postId: 'young', impressions: 100, clicks: 0, positionSum: 300 }),
            page({ postId: 'clicked', impressions: 100, clicks: 10, positionSum: 300 }),
            page({ postId: 'candidate', impressions: 100, clicks: 1, positionSum: 300 }),
            page({ postId: 'missing-post', impressions: 100, clicks: 0, positionSum: 300 }),
          ],
          queries: [],
          rankedQueries: [],
          unmappedPages: [],
          truncated: [],
        },
      }),
      config: CONFIG,
      window: WINDOW,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['candidate']);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'title_meta',
      impressions: 100,
      clicks: 1,
      position: 3,
      ageDays: 437,
      thresholds: { minImpressions: 20, maxPosition: 10, maxCtr: 0.02, minAgeDays: 30 },
    });
  });
});

describe('findRefreshCandidates', () => {
  it('reports old pages stuck beyond the position threshold', () => {
    const candidates = findRefreshCandidates({
      data: data({
        posts: [
          post({ id: 'page-one', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'young', publishedAt: '2026-03-10T00:00:00.000Z' }),
          post({ id: 'buried', publishedAt: '2025-01-01T00:00:00.000Z' }),
          post({ id: 'stale-snippet', publishedAt: '2025-01-01T00:00:00.000Z' }),
        ],
        gsc: {
          pages: [
            page({ postId: 'page-one', impressions: 100, clicks: 5, positionSum: 500 }),
            page({ postId: 'young', impressions: 100, clicks: 0, positionSum: 1_500 }),
            page({ postId: 'buried', impressions: 100, clicks: 1, positionSum: 1_500 }),
            page({ postId: 'stale-snippet', impressions: 100, clicks: 0, positionSum: 300 }),
          ],
          queries: [],
          rankedQueries: [],
          unmappedPages: [],
          truncated: [],
        },
      }),
      config: CONFIG,
      window: WINDOW,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual([
      'buried',
      'stale-snippet',
    ]);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'refresh',
      position: 15,
      trigger: 'position',
      thresholds: { minImpressions: 20, minPosition: 10, minAgeDays: 60, maxCtr: 0.02 },
    });
    expect(candidates[1]?.evidence).toMatchObject({ rule: 'refresh', trigger: 'ctr' });
  });
});

describe('findNewTopicCandidates', () => {
  const base = {
    config: CONFIG,
    knownTitles: ['Office Chair Height Guide'],
    openNewTopicFindings: 0,
    window: WINDOW,
  };

  it('rejects queries a post already ranks for and titles the site already has', () => {
    const candidates = findNewTopicCandidates({
      ...base,
      data: data({
        gsc: {
          pages: [],
          queries: [
            { query: 'office chair height guide', impressions: 100, clicks: 1, positionSum: 500 },
            { query: 'standing desk cable tray', impressions: 50, clicks: 1, positionSum: 300 },
            { query: 'quiet keyboard for calls', impressions: 80, clicks: 2, positionSum: 400 },
            { query: 'rare query', impressions: 2, clicks: 0, positionSum: 30 },
          ],
          rankedQueries: ['standing desk cable tray'],
          unmappedPages: [],
          truncated: [],
        },
      }),
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual([
      'quiet keyboard for calls',
    ]);
    expect(candidates[0]?.subjectType).toBe('query');
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'new_topic',
      impressions: 80,
      minImpressions: 10,
      queueLimit: 10,
    });
  });

  it('keeps reporting the candidate while the planner queue is at the limit', () => {
    const candidates = findNewTopicCandidates({
      ...base,
      openNewTopicFindings: 10,
      data: data({
        gsc: {
          pages: [],
          queries: [{ query: 'quiet keyboard', impressions: 100, clicks: 1, positionSum: 300 }],
          rankedQueries: [],
          unmappedPages: [],
          truncated: [],
        },
      }),
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.evidence).toMatchObject({ openNewTopicFindings: 10, queueLimit: 10 });
  });

  it('collapses queries that normalise to the same finding key', () => {
    const candidates = findNewTopicCandidates({
      ...base,
      data: data({
        gsc: {
          pages: [],
          queries: [
            { query: 'standing desk!', impressions: 100, clicks: 1, positionSum: 300 },
            { query: 'standing desk', impressions: 90, clicks: 1, positionSum: 300 },
          ],
          rankedQueries: [],
          unmappedPages: [],
          truncated: [],
        },
      }),
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['standing desk']);
  });
});

describe('findZeroCommissionCandidates', () => {
  it('stays silent while commission coverage is unknown', () => {
    const candidates = findZeroCommissionCandidates({
      data: data({
        products: [product({ clicks: 10, commissionCents: 0 })],
        commissionCoverage: 'unknown',
      }),
      config: CONFIG,
    });

    expect(candidates).toEqual([]);
  });

  it('reports products with clicks and no commission when the window is covered', () => {
    const candidates = findZeroCommissionCandidates({
      data: data({
        products: [
          product({ slug: 'paid', clicks: 10, commissionCents: 250 }),
          product({ slug: 'quiet', clicks: 1 }),
          product({ slug: 'broken', clicks: 10, program: program({ status: 'pending' }) }),
          product({ slug: 'empty', clicks: 4, orders: 0, commissionCents: 0 }),
        ],
        commissionCoverage: 'partial',
      }),
      config: CONFIG,
    });

    expect(candidates.map((candidate) => candidate.findingKey)).toEqual(['empty']);
    expect(candidates[0]?.evidence).toMatchObject({
      rule: 'product_check',
      clicks: 4,
      commissionCents: 0,
      coverage: 'partial',
      minClicks: 3,
    });
  });
});
