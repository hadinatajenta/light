import { buildAffiliateUrl } from '../../affiliate/links';
import { isDuplicateTopicTitle, normalizeTopicTitle } from '../topics';
import type { AnalystConfig } from './config';
import { resolveNoLinkMinViews } from './config';
import type { AnalystData, AnalystPostSource, AnalystProductSource } from './sources';
import type { AnalystWindow } from './window';

export const ANALYST_RULE_IDS = [
  'no_affiliate_link',
  'dead_target',
  'broken_placement',
  'redirect_misses',
  'zero_views',
  'new_topic',
] as const;

export const ANALYST_SOURCE_RULE_IDS = ['title_meta', 'refresh', 'product_check'] as const;

export type AnalystRuleId = (typeof ANALYST_RULE_IDS)[number];

export type AnalystSourceRuleId = (typeof ANALYST_SOURCE_RULE_IDS)[number];

export type AnalystCandidateRuleId = AnalystRuleId | AnalystSourceRuleId;

export type AnalystActionType = 'add_links' | 'swap_product' | 'investigate';

export type AnalystActionEffort = 'S' | 'M' | 'L';

export type AnalystSubjectType = 'post' | 'product' | 'redirect' | 'query';

export type ProductLinkProblem =
  | 'missing_product'
  | 'inactive_product'
  | 'missing_program'
  | 'program_not_approved'
  | 'tracking_id_empty'
  | 'link_invalid';

export type ProgramProblem = 'missing_program' | 'program_not_approved' | 'tracking_id_empty';

export const ANALYST_RULE_FINDING_CAP = 3;
export const ANALYST_PRIZE_CLICK_CAP = 10;
export const ANALYST_NEW_TOPIC_QUEUE_LIMIT = 10;

export const ANALYST_EFFORT_FACTORS: Record<AnalystActionEffort, number> = {
  S: 1.2,
  M: 1,
  L: 0.8,
};

export const PRODUCT_LINK_PATTERN = /\]\(product:/g;

const DAY_MS = 24 * 60 * 60 * 1000;

export const PRODUCT_LINK_PROBLEM_LABELS: Record<ProductLinkProblem, string> = {
  missing_product: 'the product row does not exist',
  inactive_product: 'the product is inactive',
  missing_program: 'the product has no program row',
  program_not_approved: 'the program is not approved',
  tracking_id_empty: 'the program has no tracking id',
  link_invalid: 'the link template or target cannot build a url',
};

export interface AnalystCandidateDraft {
  ruleId: AnalystCandidateRuleId;
  findingKey: string;
  subjectType: AnalystSubjectType;
  subjectId: string;
  title: string;
  detail: string;
  actionType: AnalystActionType;
  actionEffort: AnalystActionEffort;
  impact: number;
  confidence: number;
  prizeClicks: number;
  evidence: Record<string, unknown>;
}

export interface AnalystCandidate extends AnalystCandidateDraft {
  score: number;
  dataQuality: Record<string, string>;
}

export function findingMapKey(ruleId: string, findingKey: string): string {
  return `${ruleId}:${findingKey}`;
}

export function candidateScore(input: {
  impact: number;
  confidence: number;
  prizeClicks: number;
  actionEffort: AnalystActionEffort;
}): number {
  const impact = Math.min(Math.max(input.impact, 0), 3);
  const confidence = Math.min(Math.max(input.confidence, 0), 1);
  const prizeClicks = Math.min(Math.max(input.prizeClicks, 0), ANALYST_PRIZE_CLICK_CAP);
  const raw =
    impact * confidence * ANALYST_EFFORT_FACTORS[input.actionEffort] * (1 + prizeClicks) * 10;

  return Math.round(raw);
}

export function expectedClickRate(totalViews: number, totalClicks: number): number {
  if (totalViews <= 0) {
    return 0;
  }

  return totalClicks / totalViews;
}

export function expectedClicks(views: number, rate: number): number {
  return Math.round(Math.max(views, 0) * Math.max(rate, 0) * 10) / 10;
}

export function countProductLinks(body: string): number {
  return body.match(PRODUCT_LINK_PATTERN)?.length ?? 0;
}

export function postAgeDays(publishedAt: string | null, windowEnd: string): number | null {
  if (!publishedAt) {
    return null;
  }

  const published = Date.parse(publishedAt);
  const end = Date.parse(`${windowEnd}T00:00:00.000Z`);

  if (Number.isNaN(published) || Number.isNaN(end)) {
    return null;
  }

  return Math.floor((end - published) / DAY_MS);
}

export function classifyProductResolution(
  product: AnalystProductSource | undefined,
): ProductLinkProblem | null {
  if (!product) {
    return 'missing_product';
  }

  if (!product.isActive) {
    return 'inactive_product';
  }

  if (!product.program) {
    return 'missing_program';
  }

  if (product.program.status !== 'approved') {
    return 'program_not_approved';
  }

  if (!product.program.trackingId) {
    return 'tracking_id_empty';
  }

  return buildAffiliateUrl(product.program, product.target) === null ? 'link_invalid' : null;
}

export function classifyProgramProblem(product: AnalystProductSource): ProgramProblem | null {
  if (!product.program) {
    return 'missing_program';
  }

  if (product.program.status !== 'approved') {
    return 'program_not_approved';
  }

  if (!product.program.trackingId) {
    return 'tracking_id_empty';
  }

  return null;
}

export function averagePosition(positionSum: number, impressions: number): number {
  if (impressions <= 0) {
    return 0;
  }

  return positionSum / impressions;
}

export function clickThroughRate(clicks: number, impressions: number): number {
  if (impressions <= 0) {
    return 0;
  }

  return clicks / impressions;
}

export function findTitleMetaCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
  window: AnalystWindow;
}): AnalystCandidateDraft[] {
  const { data, config, window } = input;
  const postsById = new Map(data.posts.map((post) => [post.id, post]));
  const clickRate = expectedClickRate(data.totals.views, data.totals.clicks);
  const drafts: AnalystCandidateDraft[] = [];

  for (const page of data.gsc.pages) {
    if (!page.postId || page.impressions < config.gscMinImpressions) {
      continue;
    }

    const post = postsById.get(page.postId);

    if (!post) {
      continue;
    }

    const ageDays = postAgeDays(post.publishedAt, window.end);

    if (ageDays === null || ageDays < config.gscMinPageAgeDays) {
      continue;
    }

    const position = averagePosition(page.positionSum, page.impressions);
    const ctr = clickThroughRate(page.clicks, page.impressions);

    if (position > config.titleMetaMaxPosition || ctr >= config.titleMetaMaxCtr) {
      continue;
    }

    const prizeClicks = expectedClicks(post.views, clickRate);

    drafts.push({
      ruleId: 'title_meta',
      findingKey: post.id,
      subjectType: 'post',
      subjectId: post.id,
      title: `"${post.title}" ranks at ${position.toFixed(1)} but earns ${(ctr * 100).toFixed(1)}% clicks`,
      detail: `Search Console reports ${page.impressions} impressions and ${page.clicks} clicks at average position ${position.toFixed(1)}. The page already ranks; the title and meta description are not earning the click.`,
      actionType: 'investigate',
      actionEffort: 'S',
      impact: 2,
      confidence: 0.7,
      prizeClicks,
      evidence: {
        rule: 'title_meta',
        postId: post.id,
        impressions: page.impressions,
        clicks: page.clicks,
        ctr,
        position,
        ageDays,
        thresholds: {
          minImpressions: config.gscMinImpressions,
          maxPosition: config.titleMetaMaxPosition,
          maxCtr: config.titleMetaMaxCtr,
          minAgeDays: config.gscMinPageAgeDays,
        },
        window: { start: window.start, end: window.end },
        expectedClickRate: clickRate,
        prizeClicks,
      },
    });
  }

  return drafts.sort(
    (first, second) =>
      (second.evidence.impressions as number) - (first.evidence.impressions as number) ||
      first.findingKey.localeCompare(second.findingKey),
  );
}

export function findRefreshCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
  window: AnalystWindow;
}): AnalystCandidateDraft[] {
  const { data, config, window } = input;
  const postsById = new Map(data.posts.map((post) => [post.id, post]));
  const clickRate = expectedClickRate(data.totals.views, data.totals.clicks);
  const drafts: AnalystCandidateDraft[] = [];

  for (const page of data.gsc.pages) {
    if (!page.postId || page.impressions < config.gscMinImpressions) {
      continue;
    }

    const post = postsById.get(page.postId);

    if (!post) {
      continue;
    }

    const ageDays = postAgeDays(post.publishedAt, window.end);

    if (ageDays === null || ageDays < config.refreshMinAgeDays) {
      continue;
    }

    const position = averagePosition(page.positionSum, page.impressions);
    const ctr = clickThroughRate(page.clicks, page.impressions);

    if (position <= config.refreshMinPosition && ctr >= config.titleMetaMaxCtr) {
      continue;
    }

    const prizeClicks = expectedClicks(post.views, clickRate);
    const isBuried = position > config.refreshMinPosition;

    drafts.push({
      ruleId: 'refresh',
      findingKey: post.id,
      subjectType: 'post',
      subjectId: post.id,
      title: isBuried
        ? `"${post.title}" is buried at position ${position.toFixed(1)}`
        : `"${post.title}" earns almost no clicks at position ${position.toFixed(1)}`,
      detail: isBuried
        ? `Search Console reports ${page.impressions} impressions and ${page.clicks} clicks at average position ${position.toFixed(1)}. The post is ${ageDays} days old and the body, not the snippet, is what has to move it; refresh the article.`
        : `Search Console reports ${page.impressions} impressions and only ${page.clicks} clicks at average position ${position.toFixed(1)}. The post is ${ageDays} days old; refresh the body before rewriting the snippet.`,
      actionType: 'investigate',
      actionEffort: 'M',
      impact: 2,
      confidence: 0.65,
      prizeClicks,
      evidence: {
        rule: 'refresh',
        postId: post.id,
        impressions: page.impressions,
        clicks: page.clicks,
        ctr,
        position,
        trigger: isBuried ? 'position' : 'ctr',
        ageDays,
        thresholds: {
          minImpressions: config.gscMinImpressions,
          minPosition: config.refreshMinPosition,
          minAgeDays: config.refreshMinAgeDays,
          maxCtr: config.titleMetaMaxCtr,
        },
        window: { start: window.start, end: window.end },
        expectedClickRate: clickRate,
        prizeClicks,
      },
    });
  }

  return drafts.sort(
    (first, second) =>
      (second.evidence.impressions as number) - (first.evidence.impressions as number) ||
      first.findingKey.localeCompare(second.findingKey),
  );
}

export function findNewTopicCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
  knownTitles: readonly string[];
  openNewTopicFindings: number;
  window: AnalystWindow;
}): AnalystCandidateDraft[] {
  const rankedQueries = new Set(input.data.gsc.rankedQueries);
  const drafts = input.data.gsc.queries
    .filter(
      (query) =>
        query.impressions >= input.config.newTopicMinImpressions &&
        !rankedQueries.has(normalizeTopicTitle(query.query)) &&
        !isDuplicateTopicTitle(query.query, input.knownTitles),
    )
    .sort(
      (first, second) =>
        second.impressions - first.impressions || first.query.localeCompare(second.query),
    )
    .map((query) => {
      const position = averagePosition(query.positionSum, query.impressions);

      return {
        ruleId: 'new_topic' as const,
        findingKey: normalizeTopicTitle(query.query) || query.query.toLowerCase(),
        subjectType: 'query' as const,
        subjectId: query.query,
        title: `No article ranks for "${query.query}"`,
        detail: `Search Console reports ${query.impressions} impressions and ${query.clicks} clicks at average position ${position.toFixed(1)}, and no published article covers the query. Add it to the planner.`,
        actionType: 'investigate' as const,
        actionEffort: 'M' as const,
        impact: 2,
        confidence: 0.6,
        prizeClicks: query.clicks,
        evidence: {
          rule: 'new_topic',
          query: query.query,
          impressions: query.impressions,
          clicks: query.clicks,
          position,
          minImpressions: input.config.newTopicMinImpressions,
          openNewTopicFindings: input.openNewTopicFindings,
          queueLimit: ANALYST_NEW_TOPIC_QUEUE_LIMIT,
          window: { start: input.window.start, end: input.window.end },
          prizeClicks: query.clicks,
        },
      };
    });
  const seen = new Set<string>();

  return drafts.filter((draft) => {
    if (seen.has(draft.findingKey)) {
      return false;
    }

    seen.add(draft.findingKey);
    return true;
  });
}

export function findZeroCommissionCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
}): AnalystCandidateDraft[] {
  if (input.data.commissionCoverage === 'unknown') {
    return [];
  }

  const minClicks = input.config.productCheckMinClicks;

  return input.data.products
    .filter(
      (product) =>
        product.clicks >= minClicks &&
        product.commissionCents === 0 &&
        classifyProgramProblem(product) === null,
    )
    .sort((first, second) => second.clicks - first.clicks || first.slug.localeCompare(second.slug))
    .map((product) => ({
      ruleId: 'product_check' as const,
      findingKey: product.slug,
      subjectType: 'product' as const,
      subjectId: product.slug,
      title: `"${product.name}" earned no commission from ${product.clicks} click(s)`,
      detail: `${product.clicks} click(s) and ${product.orders} order(s) in the window produced zero commission while the affiliate report covers ${input.data.commissionCoverage} of the window. Check the product page, the price, and whether the order was returned.`,
      actionType: 'investigate' as const,
      actionEffort: 'M' as const,
      impact: 2,
      confidence: 0.7,
      prizeClicks: product.clicks,
      evidence: {
        rule: 'product_check',
        slug: product.slug,
        productName: product.name,
        clicks: product.clicks,
        orders: product.orders,
        commissionCents: product.commissionCents,
        coverage: input.data.commissionCoverage,
        minClicks,
        prizeClicks: product.clicks,
      },
    }));
}

function activeProductCountByCategory(
  products: readonly AnalystProductSource[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const product of products) {
    if (!product.isActive) {
      continue;
    }

    for (const topic of product.topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return counts;
}

export function findNoAffiliateLinkCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
}): AnalystCandidateDraft[] {
  const { posts, products, totals } = input.data;
  const minViews = resolveNoLinkMinViews(input.config, totals.views);
  const clickRate = expectedClickRate(totals.views, totals.clicks);
  const activeByCategory = activeProductCountByCategory(products);

  return posts
    .filter((post) => {
      if (post.views < minViews || countProductLinks(post.body) > 0 || !post.category) {
        return false;
      }

      return (activeByCategory.get(post.category) ?? 0) > 0;
    })
    .sort((first, second) => second.views - first.views || first.id.localeCompare(second.id))
    .map((post) => {
      const category = post.category as string;
      const activeProducts = activeByCategory.get(category) ?? 0;
      const prizeClicks = expectedClicks(post.views, clickRate);

      return {
        ruleId: 'no_affiliate_link' as const,
        findingKey: post.id,
        subjectType: 'post' as const,
        subjectId: post.id,
        title: `No product links in "${post.title}" despite ${post.views} views`,
        detail: `The post took ${post.views} views in the window and carries no product link. Category "${category}" has ${activeProducts} active product(s).`,
        actionType: 'add_links' as const,
        actionEffort: 'M' as const,
        impact: 3,
        confidence: 0.9,
        prizeClicks,
        evidence: {
          rule: 'no_affiliate_link',
          postId: post.id,
          views: post.views,
          baselineViews: post.baselineViews,
          totalViews: totals.views,
          totalClicks: totals.clicks,
          minViews,
          thresholds: {
            share: input.config.noLinkMinViewsShare,
            floor: input.config.noLinkMinViewsFloor,
          },
          category,
          activeProductsInCategory: activeProducts,
          productLinks: 0,
          expectedClickRate: clickRate,
          prizeClicks,
        },
      };
    });
}

export function findDeadTargetCandidates(input: { data: AnalystData }): AnalystCandidateDraft[] {
  const { posts, products, totals } = input.data;
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const clickRate = expectedClickRate(totals.views, totals.clicks);
  const drafts: AnalystCandidateDraft[] = [];

  for (const post of posts) {
    for (const slug of post.productSlugs) {
      const product = productsBySlug.get(slug);
      const problem = classifyProductResolution(product);

      if (!problem) {
        continue;
      }

      const prizeClicks = expectedClicks(post.views, clickRate);

      drafts.push({
        ruleId: 'dead_target',
        findingKey: `${post.id}:${slug}`,
        subjectType: 'post',
        subjectId: post.id,
        title: `Product link "${slug}" cannot resolve in "${post.title}"`,
        detail: `The published body links to product:${slug}, but ${PRODUCT_LINK_PROBLEM_LABELS[problem]}. The post took ${post.views} views in the window and every click on that link earns nothing.`,
        actionType: 'swap_product',
        actionEffort: 'S',
        impact: 3,
        confidence: 1,
        prizeClicks,
        evidence: {
          rule: 'dead_target',
          postId: post.id,
          slug,
          problem: PRODUCT_LINK_PROBLEM_LABELS[problem],
          views: post.views,
          baselineViews: post.baselineViews,
          totalViews: totals.views,
          totalClicks: totals.clicks,
          productName: product?.name ?? null,
          productActive: product?.isActive ?? null,
          programStatus: product?.program?.status ?? null,
          trackingIdPresent: product?.program ? Boolean(product.program.trackingId) : null,
          expectedClickRate: clickRate,
          prizeClicks,
        },
      });
    }
  }

  return drafts.sort(
    (first, second) =>
      second.prizeClicks - first.prizeClicks || first.findingKey.localeCompare(second.findingKey),
  );
}

export function findBrokenPlacementCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
}): AnalystCandidateDraft[] {
  const { products } = input.data;
  const minClicks = input.config.brokenPlacementMinClicks;

  return products
    .filter((product) => product.clicks >= minClicks && classifyProgramProblem(product) !== null)
    .sort((first, second) => second.clicks - first.clicks || first.slug.localeCompare(second.slug))
    .map((product) => {
      const problem = classifyProgramProblem(product) as ProgramProblem;

      return {
        ruleId: 'broken_placement' as const,
        findingKey: product.slug,
        subjectType: 'product' as const,
        subjectId: product.slug,
        title: `Clicks on "${product.name}" cannot earn because ${PRODUCT_LINK_PROBLEM_LABELS[problem]}`,
        detail: `${product.clicks} click(s) in the window reach a program that cannot pay out. Fix the program or swap the product before more traffic arrives.`,
        actionType: 'investigate' as const,
        actionEffort: 'M' as const,
        impact: 3,
        confidence: 0.95,
        prizeClicks: product.clicks,
        evidence: {
          rule: 'broken_placement',
          slug: product.slug,
          productName: product.name,
          clicks: product.clicks,
          minClicks,
          problem: PRODUCT_LINK_PROBLEM_LABELS[problem],
          programId: product.program?.id ?? null,
          programStatus: product.program?.status ?? null,
          trackingIdPresent: product.program ? Boolean(product.program.trackingId) : false,
          prizeClicks: product.clicks,
        },
      };
    });
}

export function findRedirectMissCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
}): AnalystCandidateDraft[] {
  const minCount = input.config.redirectMissMinCount;

  return input.data.redirectMisses
    .filter((miss) => miss.missCount >= minCount)
    .sort(
      (first, second) =>
        second.missCount - first.missCount || first.slug.localeCompare(second.slug),
    )
    .map((miss) => ({
      ruleId: 'redirect_misses' as const,
      findingKey: miss.slug,
      subjectType: 'redirect' as const,
      subjectId: miss.slug,
      title: `/go/${miss.slug} returned 404 ${miss.missCount} times`,
      detail: `Readers followed a link to /go/${miss.slug} and the redirect had no target. Add the redirect or fix the referring page.`,
      actionType: 'investigate' as const,
      actionEffort: 'S' as const,
      impact: 2,
      confidence: 0.8,
      prizeClicks: miss.missCount,
      evidence: {
        rule: 'redirect_misses',
        slug: miss.slug,
        missCount: miss.missCount,
        minCount,
        referrerPaths: miss.referrerPaths.slice(0, 5),
        prizeClicks: miss.missCount,
      },
    }));
}

export function findZeroViewCandidates(input: {
  data: AnalystData;
  config: AnalystConfig;
  window: AnalystWindow;
}): AnalystCandidateDraft[] {
  const minAgeDays = input.config.zeroViewsMinAgeDays;

  return input.data.posts
    .filter((post) => post.views === 0)
    .map((post) => ({ post, ageDays: postAgeDays(post.publishedAt, input.window.end) }))
    .filter(
      (entry): entry is { post: AnalystPostSource; ageDays: number } =>
        entry.ageDays !== null && entry.ageDays > minAgeDays,
    )
    .sort(
      (first, second) =>
        second.ageDays - first.ageDays || first.post.id.localeCompare(second.post.id),
    )
    .map(({ post, ageDays }) => ({
      ruleId: 'zero_views' as const,
      findingKey: post.id,
      subjectType: 'post' as const,
      subjectId: post.id,
      title: `"${post.title}" took zero views in 28 days`,
      detail: `The post was published ${ageDays} days ago and the window ended ${input.window.end}. Review the title, the internal links, and whether the article should be merged or retired.`,
      actionType: 'investigate' as const,
      actionEffort: 'M' as const,
      impact: 1,
      confidence: 0.7,
      prizeClicks: 0,
      evidence: {
        rule: 'zero_views',
        postId: post.id,
        ageDays,
        minAgeDays,
        publishedAt: post.publishedAt,
        windowEnd: input.window.end,
        views: 0,
        baselineViews: post.baselineViews,
      },
    }));
}

export function rankDrafts(
  drafts: readonly AnalystCandidateDraft[],
  cap: number,
): AnalystCandidateDraft[] {
  const ranked = drafts.map((draft, index) => ({
    draft,
    index,
    score: candidateScore(draft),
  }));

  ranked.sort((first, second) => second.score - first.score || first.index - second.index);

  return ranked.slice(0, Math.max(cap, 0)).map((entry) => entry.draft);
}

export interface AnalystRuleRun {
  candidates: AnalystCandidate[];
  presentKeys: string[];
}

export interface AnalystRuleRunInput {
  data: AnalystData;
  config: AnalystConfig;
  window: AnalystWindow;
  dataQuality: Record<string, string>;
  knownTitles?: readonly string[];
  openNewTopicFindings?: number;
}

export function runAnalystRules(input: AnalystRuleRunInput): AnalystRuleRun {
  const refreshDrafts = findRefreshCandidates({
    data: input.data,
    config: input.config,
    window: input.window,
  });
  const titleMetaDrafts = findTitleMetaCandidates({
    data: input.data,
    config: input.config,
    window: input.window,
  });
  const emittedRefreshPosts = new Set(
    rankDrafts(refreshDrafts, ANALYST_RULE_FINDING_CAP).map((draft) => draft.findingKey),
  );
  const emittedTitleMetaDrafts = titleMetaDrafts.filter(
    (draft) => !emittedRefreshPosts.has(draft.findingKey),
  );

  const groups: Array<{ drafts: AnalystCandidateDraft[]; cap: number }> = [
    {
      drafts: findNoAffiliateLinkCandidates({ data: input.data, config: input.config }),
      cap: ANALYST_RULE_FINDING_CAP,
    },
    { drafts: findDeadTargetCandidates({ data: input.data }), cap: ANALYST_RULE_FINDING_CAP },
    {
      drafts: findBrokenPlacementCandidates({ data: input.data, config: input.config }),
      cap: ANALYST_RULE_FINDING_CAP,
    },
    {
      drafts: findRedirectMissCandidates({ data: input.data, config: input.config }),
      cap: ANALYST_RULE_FINDING_CAP,
    },
    {
      drafts: findZeroViewCandidates({
        data: input.data,
        config: input.config,
        window: input.window,
      }),
      cap: Math.min(ANALYST_RULE_FINDING_CAP, input.config.zeroViewsMaxFindings),
    },
    { drafts: refreshDrafts, cap: ANALYST_RULE_FINDING_CAP },
    { drafts: emittedTitleMetaDrafts, cap: ANALYST_RULE_FINDING_CAP },
    {
      drafts: findNewTopicCandidates({
        data: input.data,
        config: input.config,
        knownTitles: input.knownTitles ?? [],
        openNewTopicFindings: input.openNewTopicFindings ?? 0,
        window: input.window,
      }),
      cap:
        (input.openNewTopicFindings ?? 0) >= ANALYST_NEW_TOPIC_QUEUE_LIMIT
          ? 0
          : ANALYST_RULE_FINDING_CAP,
    },
    {
      drafts: findZeroCommissionCandidates({ data: input.data, config: input.config }),
      cap: ANALYST_RULE_FINDING_CAP,
    },
  ];

  const candidates: AnalystCandidate[] = [];
  const presentKeys: string[] = [];

  for (const group of groups) {
    for (const draft of group.drafts) {
      presentKeys.push(findingMapKey(draft.ruleId, draft.findingKey));
    }

    for (const draft of rankDrafts(group.drafts, group.cap)) {
      candidates.push({
        ...draft,
        score: candidateScore(draft),
        dataQuality: input.dataQuality,
      });
    }
  }

  return { candidates, presentKeys };
}
