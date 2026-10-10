import { readClicksByDay, readClickTotals, readTopProducts } from '../affiliate/clicks';
import { listProducts, listPrograms } from '../affiliate/store';
import { listAgents } from '../agents/store';
import { countTopics, listTopics } from '../agents/topics';

const DAY_MS = 24 * 60 * 60 * 1000;
const AFFILIATE_INPUT_COST_PER_MILLION = 0.15;
const AFFILIATE_OUTPUT_COST_PER_MILLION = 0.6;

export interface PostRowLite {
  id: string;
  title: string;
  status: string;
  category: string | null;
  tags: string;
  body: string;
  cover_url: string | null;
  review_status: string | null;
  pub_date: string | null;
  updated_date: string | null;
}

export interface ContentAnalytics {
  total: number;
  published: number;
  drafts: number;
  archived: number;
  publishedLast30: number;
  publishedPrevious30: number;
  series: { sevenDay: number[]; thirtyDay: number[]; ninetyDay: number[] };
  byCategory: Array<{ category: string; count: number }>;
  byTag: Array<{ tag: string; count: number }>;
  averageWords: number;
  withCover: number;
  withAffiliateLinks: number;
  longestDrafts: Array<{ id: string; title: string; days: number }>;
}

export interface PipelineAnalytics {
  topicsQueued: number;
  topicsResearched: number;
  topicsInProgress: number;
  topicsUsed: number;
  topicsBlocked: number;
  researchNotes: number;
  pendingReview: number;
  changesRequested: number;
  approvedNotPublished: number;
}

export interface AgentAnalytics {
  total: number;
  enabled: number;
  runsLast24h: number;
  runsLast7d: number;
  runsTotal: number;
  failedTotal: number;
  successRate: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  perAgent: Array<{
    id: string;
    name: string;
    role: string;
    enabled: boolean;
    runsPerDay: number;
    runs: number;
    failedRuns: number;
    tokensIn: number;
    tokensOut: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }>;
  recentRuns: Array<{
    id: string;
    agentId: string;
    agentName: string;
    status: string;
    summary: string | null;
    startedAt: string;
    tokensOut: number | null;
  }>;
}

export interface AffiliateAnalytics {
  programs: number;
  products: number;
  activeProducts: number;
  clicks: { last24h: number; last7d: number; last30d: number; total: number };
  clicksByDay: number[];
  topProducts: Array<{ slug: string; name: string; clicks: number; lastClickAt: string | null }>;
  brokenReferences: Array<{ postId: string; postTitle: string; slug: string }>;
}

export interface ActivityAnalytics {
  last24h: number;
  last7d: number;
  total: number;
  byActorType: Array<{ type: string; count: number }>;
}

export interface AnalyticsSnapshot {
  generatedAt: string;
  content: ContentAnalytics;
  pipeline: PipelineAnalytics;
  agents: AgentAnalytics;
  affiliate: AffiliateAnalytics;
  activity: ActivityAnalytics;
  media: { count: number; totalBytes: number };
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function buildDailySeries(dates: (string | null)[], days: number): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const now = Date.now();

  for (const raw of dates) {
    if (!raw) {
      continue;
    }

    const time = new Date(raw).getTime();
    if (Number.isNaN(time)) {
      continue;
    }

    const daysAgo = Math.floor((now - time) / DAY_MS);
    if (daysAgo < 0 || daysAgo >= days) {
      continue;
    }

    buckets[days - 1 - daysAgo] += 1;
  }

  return buckets;
}

function countWithin(dates: (string | null)[], fromDays: number, toDays: number): number {
  const now = Date.now();
  let total = 0;

  for (const raw of dates) {
    if (!raw) {
      continue;
    }

    const time = new Date(raw).getTime();
    if (Number.isNaN(time)) {
      continue;
    }

    const age = now - time;
    if (age >= fromDays * DAY_MS && age < toDays * DAY_MS) {
      total += 1;
    }
  }

  return total;
}

function estimateWords(body: string): number {
  const trimmed = body.trim();
  return trimmed.length === 0 ? 0 : Math.round(trimmed.split(/\s+/).length);
}

async function loadContentAnalytics(db: D1Database): Promise<ContentAnalytics> {
  const result = await db
    .prepare(
      `SELECT id, title, status, category, tags, body, cover_url, review_status, pub_date, updated_date
       FROM posts`,
    )
    .all<PostRowLite>();

  const posts = result.results ?? [];
  const published = posts.filter((post) => post.status === 'published');
  const draftPosts = posts.filter((post) => post.status === 'draft');
  const publishedDates = published.map((post) => post.pub_date);

  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  let wordTotal = 0;
  let withCover = 0;
  let withAffiliateLinks = 0;

  for (const post of published) {
    if (post.category) {
      categoryCounts.set(post.category, (categoryCounts.get(post.category) ?? 0) + 1);
    }

    for (const tag of parseTags(post.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    wordTotal += estimateWords(post.body);
    if (post.cover_url) {
      withCover += 1;
    }
    if (post.body.includes('](product:')) {
      withAffiliateLinks += 1;
    }
  }

  const now = Date.now();
  const longestDrafts = draftPosts
    .map((post) => ({
      id: post.id,
      title: post.title,
      days: Math.max(
        0,
        Math.floor((now - new Date(post.updated_date ?? post.pub_date ?? now).getTime()) / DAY_MS),
      ),
    }))
    .sort((first, second) => second.days - first.days)
    .slice(0, 5);

  return {
    total: posts.length,
    published: published.length,
    drafts: draftPosts.length,
    archived: posts.filter((post) => post.status === 'archived').length,
    publishedLast30: countWithin(publishedDates, 0, 30),
    publishedPrevious30: countWithin(publishedDates, 30, 60),
    series: {
      sevenDay: buildDailySeries(publishedDates, 7),
      thirtyDay: buildDailySeries(publishedDates, 30),
      ninetyDay: buildDailySeries(publishedDates, 90),
    },
    byCategory: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((first, second) => second.count - first.count),
    byTag: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 12),
    averageWords: published.length > 0 ? Math.round(wordTotal / published.length) : 0,
    withCover,
    withAffiliateLinks,
    longestDrafts,
  };
}

async function loadPipelineAnalytics(db: D1Database): Promise<PipelineAnalytics> {
  const [counts, notes, reviewRows] = await Promise.all([
    countTopics(db),
    db
      .prepare('SELECT COUNT(*) AS total FROM sources')
      .first<{ total: number }>()
      .then((row) => row?.total ?? 0),
    db
      .prepare(
        "SELECT review_status, COUNT(*) AS total FROM posts WHERE status = 'draft' GROUP BY review_status",
      )
      .all<{ review_status: string | null; total: number }>(),
  ]);

  let pendingReview = 0;
  let changesRequested = 0;
  let approvedNotPublished = 0;

  for (const row of reviewRows.results ?? []) {
    if (row.review_status === 'pending' || row.review_status === null) {
      pendingReview += row.total;
    } else if (row.review_status === 'changes_requested') {
      changesRequested += row.total;
    } else if (row.review_status === 'approved') {
      approvedNotPublished += row.total;
    }
  }

  return {
    topicsQueued: counts.queued,
    topicsResearched: counts.researched,
    topicsInProgress: counts.inProgress,
    topicsUsed: counts.used,
    topicsBlocked: counts.blocked,
    researchNotes: notes,
    pendingReview,
    changesRequested,
    approvedNotPublished,
  };
}

interface AgentRunAggregateRow {
  agent_id: string;
  runs: number;
  failed: number;
  tokens_in: number | null;
  tokens_out: number | null;
  last_run_at: string | null;
}

async function loadAgentAnalytics(db: D1Database): Promise<AgentAnalytics> {
  const [agents, aggregates, totals, recent] = await Promise.all([
    listAgents(db),
    db
      .prepare(
        `SELECT agent_id, COUNT(*) AS runs,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out,
                MAX(started_at) AS last_run_at
         FROM agent_runs GROUP BY agent_id`,
      )
      .all<AgentRunAggregateRow>(),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS last24h,
           SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS last7d,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out
         FROM agent_runs`,
      )
      .bind(
        new Date(Date.now() - DAY_MS).toISOString(),
        new Date(Date.now() - 7 * DAY_MS).toISOString(),
      )
      .first<{
        last24h: number | null;
        last7d: number | null;
        total: number | null;
        failed: number | null;
        tokens_in: number | null;
        tokens_out: number | null;
      }>(),
    db
      .prepare(
        `SELECT id, agent_id, status, summary, started_at, tokens_out
         FROM agent_runs ORDER BY started_at DESC LIMIT 10`,
      )
      .all<{
        id: string;
        agent_id: string;
        status: string;
        summary: string | null;
        started_at: string;
        tokens_out: number | null;
      }>(),
  ]);

  const aggregateByAgent = new Map((aggregates.results ?? []).map((row) => [row.agent_id, row]));
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const tokensIn = totals?.tokens_in ?? 0;
  const tokensOut = totals?.tokens_out ?? 0;
  const runsTotal = totals?.total ?? 0;
  const failedTotal = totals?.failed ?? 0;

  return {
    total: agents.length,
    enabled: agents.filter((agent) => agent.enabled).length,
    runsLast24h: totals?.last24h ?? 0,
    runsLast7d: totals?.last7d ?? 0,
    runsTotal,
    failedTotal,
    successRate: runsTotal > 0 ? Math.round(((runsTotal - failedTotal) / runsTotal) * 100) : 0,
    tokensIn,
    tokensOut,
    estimatedCostUsd:
      Math.round(
        ((tokensIn / 1_000_000) * AFFILIATE_INPUT_COST_PER_MILLION +
          (tokensOut / 1_000_000) * AFFILIATE_OUTPUT_COST_PER_MILLION) *
          10_000,
      ) / 10_000,
    perAgent: agents.map((agent) => {
      const aggregate = aggregateByAgent.get(agent.id);

      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        enabled: agent.enabled,
        runsPerDay: agent.runsPerDay,
        runs: aggregate?.runs ?? 0,
        failedRuns: aggregate?.failed ?? 0,
        tokensIn: aggregate?.tokens_in ?? 0,
        tokensOut: aggregate?.tokens_out ?? 0,
        lastRunAt: agent.lastRunAt ?? aggregate?.last_run_at ?? null,
        nextRunAt: agent.nextRunAt,
      };
    }),
    recentRuns: (recent.results ?? []).map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      agentName: agentNames.get(row.agent_id) ?? row.agent_id,
      status: row.status,
      summary: row.summary,
      startedAt: row.started_at,
      tokensOut: row.tokens_out,
    })),
  };
}

async function loadAffiliateAnalytics(db: D1Database): Promise<AffiliateAnalytics> {
  const [programs, products, clickTotals, clicksByDay, topProducts, postRows] = await Promise.all([
    listPrograms(db),
    listProducts(db),
    readClickTotals(db),
    readClicksByDay(db, 30),
    readTopProducts(db, 8),
    db
      .prepare("SELECT id, title, body FROM posts WHERE status = 'published'")
      .all<{ id: string; title: string; body: string }>(),
  ]);

  const knownSlugs = new Set(products.map((product) => product.slug));
  const brokenReferences: Array<{ postId: string; postTitle: string; slug: string }> = [];

  for (const post of postRows.results ?? []) {
    const matches = post.body.matchAll(/\]\(product:([a-z0-9-]+)\)/g);
    const seen = new Set<string>();

    for (const match of matches) {
      const slug = match[1];
      if (knownSlugs.has(slug) || seen.has(slug)) {
        continue;
      }

      seen.add(slug);
      brokenReferences.push({ postId: post.id, postTitle: post.title, slug });
    }
  }

  return {
    programs: programs.length,
    products: products.length,
    activeProducts: products.filter((product) => product.isActive).length,
    clicks: clickTotals,
    clicksByDay,
    topProducts,
    brokenReferences: brokenReferences.slice(0, 20),
  };
}

async function loadActivityAnalytics(db: D1Database): Promise<ActivityAnalytics> {
  const [totals, byActorType] = await Promise.all([
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last24h,
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last7d,
           COUNT(*) AS total
         FROM activity`,
      )
      .bind(
        new Date(Date.now() - DAY_MS).toISOString(),
        new Date(Date.now() - 7 * DAY_MS).toISOString(),
      )
      .first<{ last24h: number | null; last7d: number | null; total: number | null }>(),
    db
      .prepare('SELECT actor_type, COUNT(*) AS total FROM activity GROUP BY actor_type')
      .all<{ actor_type: string; total: number }>(),
  ]);

  return {
    last24h: totals?.last24h ?? 0,
    last7d: totals?.last7d ?? 0,
    total: totals?.total ?? 0,
    byActorType: (byActorType.results ?? []).map((row) => ({
      type: row.actor_type,
      count: row.total,
    })),
  };
}

export async function loadAnalyticsSnapshot(db: D1Database): Promise<AnalyticsSnapshot> {
  const [content, pipeline, agents, affiliate, activity, media] = await Promise.all([
    loadContentAnalytics(db),
    loadPipelineAnalytics(db),
    loadAgentAnalytics(db),
    loadAffiliateAnalytics(db),
    loadActivityAnalytics(db),
    db
      .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(bytes), 0) AS bytes FROM media')
      .first<{ total: number; bytes: number }>(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    content,
    pipeline,
    agents,
    affiliate,
    activity,
    media: { count: media?.total ?? 0, totalBytes: media?.bytes ?? 0 },
  };
}

export async function loadTopicHighlights(db: D1Database) {
  const [queued, blocked] = await Promise.all([
    listTopics(db, { status: 'queued', limit: 6 }),
    listTopics(db, { status: 'blocked', limit: 6 }),
  ]);

  return { queued, blocked };
}
