export const VIEW_DAY_TIME_ZONE = 'Asia/Jakarta';
export const VIEW_RANGE_DAYS = [7, 30] as const;
export type ViewRangeDays = (typeof VIEW_RANGE_DAYS)[number];

const DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIEW_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIEW_DAY_TIME_ZONE,
  day: '2-digit',
  month: 'short',
});

const BOT_AGENT_PATTERN =
  /(bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|bitlybot|vkshare|whatsapp|telegrambot|discordbot|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|yandex|baiduspider|duckduckbot|applebot|googlebot|headlesschrome|lighthouse|pingdom|uptimerobot|site24x7|statuscake|newrelic|datadog|preview|monitor|validator|feedfetcher|scrapy|curl|wget|python-requests|python-urllib|go-http-client|java\/|okhttp|axios|node-fetch|undici|postman)/i;

const PREFETCH_HINTS = ['prefetch', 'prerender', 'preview'];

export interface ViewDay {
  day: string;
  label: string;
}

export interface ViewTotals {
  views: number;
  previousViews: number;
  changePercent: number | null;
}

export interface ViewSeriesPoint extends ViewDay {
  views: number;
}

export interface TopViewedPost {
  postId: string;
  title: string;
  category: string | null;
  views: number;
  clicks: number;
  clickRate: number | null;
}

export interface ViewSnapshot {
  generatedAt: string;
  days: number;
  timeZone: string;
  today: ViewTotals;
  week: ViewTotals;
  month: ViewTotals;
  series: ViewSeriesPoint[];
  topPosts: TopViewedPost[];
  summary: {
    viewsInRange: number;
    viewsPerDay: number;
    peakDay: ViewSeriesPoint | null;
    publishedPosts: number;
    viewsPerPost: number;
  };
  opportunities: {
    noClicks: TopViewedPost[];
    bestClickRate: TopViewedPost[];
  };
}

interface CountRow {
  day: string;
  total: number;
}

interface TopPostRow {
  post_id: string;
  title: string;
  category: string | null;
  views: number;
  clicks: number;
}

const TOP_POST_LIMIT = 12;
const OPPORTUNITY_LIMIT = 5;

export function viewDayKey(date: Date): string {
  return DAY_FORMATTER.format(date);
}

export function addViewDays(dayKey: string, offset: number): string {
  const parsed = new Date(`${dayKey}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

export function viewDaySeries(days: number, today: string): ViewDay[] {
  const keys: ViewDay[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = addViewDays(today, -offset);
    keys.push({ day, label: viewDayLabel(day) });
  }

  return keys;
}

export function viewDayLabel(dayKey: string): string {
  const parsed = new Date(`${dayKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return dayKey;
  }

  return DAY_LABEL_FORMATTER.format(parsed);
}

export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function normalizeViewPath(pathname: string): string {
  const trimmed = pathname.split('?')[0].split('#')[0];
  if (trimmed === '' || trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export function postIdFromViewPath(path: string): string | null {
  const match = /^\/blog\/([a-z0-9-]+)$/i.exec(path);
  return match ? match[1] : null;
}

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) {
    return true;
  }

  return BOT_AGENT_PATTERN.test(userAgent);
}

export function isPrefetchRequest(headers: Headers): boolean {
  const purpose = [
    headers.get('purpose'),
    headers.get('sec-purpose'),
    headers.get('x-purpose'),
    headers.get('x-moz'),
  ];

  return purpose.some(
    (value) => value !== null && PREFETCH_HINTS.some((hint) => value.includes(hint)),
  );
}

export function shouldRecordView(request: Request): boolean {
  if (request.method !== 'GET') {
    return false;
  }

  if (isPrefetchRequest(request.headers)) {
    return false;
  }

  return !isBotUserAgent(request.headers.get('user-agent'));
}

export async function recordView(
  db: D1Database,
  entry: { path: string; postId: string | null; now?: Date },
): Promise<void> {
  const now = entry.now ?? new Date();

  await db
    .prepare(
      `INSERT INTO post_views (day, path, post_id, count, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(day, path) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    )
    .bind(viewDayKey(now), entry.path, entry.postId, now.toISOString())
    .run();
}

export function sumViewCounts(rows: CountRow[], from: string, to: string): number {
  return rows
    .filter((row) => row.day >= from && row.day <= to)
    .reduce((total, row) => total + row.total, 0);
}

export function buildViewTotals(current: number, previous: number): ViewTotals {
  return {
    views: current,
    previousViews: previous,
    changePercent: changePercent(current, previous),
  };
}

export function toClickRate(views: number, clicks: number): number | null {
  if (views === 0) {
    return null;
  }

  return Math.round((clicks / views) * 1000) / 10;
}

export function buildTopViewedPosts(rows: TopPostRow[]): TopViewedPost[] {
  return rows.map((row) => ({
    postId: row.post_id,
    title: row.title,
    category: row.category,
    views: row.views,
    clicks: row.clicks,
    clickRate: toClickRate(row.views, row.clicks),
  }));
}

export function selectOpportunities(posts: TopViewedPost[]): {
  noClicks: TopViewedPost[];
  bestClickRate: TopViewedPost[];
} {
  const noClicks = posts
    .filter((post) => post.clicks === 0 && post.views > 0)
    .sort((first, second) => second.views - first.views)
    .slice(0, OPPORTUNITY_LIMIT);

  const bestClickRate = posts
    .filter((post) => post.clickRate !== null && post.clicks > 0)
    .sort((first, second) => (second.clickRate ?? 0) - (first.clickRate ?? 0))
    .slice(0, OPPORTUNITY_LIMIT);

  return { noClicks, bestClickRate };
}

async function loadDayCounts(db: D1Database, from: string, to: string): Promise<CountRow[]> {
  const result = await db
    .prepare(
      `SELECT day, SUM(count) AS total FROM post_views
       WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`,
    )
    .bind(from, to)
    .all<CountRow>();

  return result.results ?? [];
}

async function loadTopPosts(db: D1Database, from: string, to: string): Promise<TopViewedPost[]> {
  const result = await db
    .prepare(
      `SELECT v.post_id, p.title, p.category,
              SUM(v.count) AS views,
              (SELECT COUNT(*) FROM clicks c
                WHERE c.post_id = v.post_id AND date(c.created_at) >= ? AND date(c.created_at) <= ?) AS clicks
       FROM post_views v
       JOIN posts p ON p.id = v.post_id
       WHERE v.post_id IS NOT NULL AND v.day >= ? AND v.day <= ?
       GROUP BY v.post_id
       ORDER BY views DESC, p.title ASC
       LIMIT ?`,
    )
    .bind(from, to, from, to, TOP_POST_LIMIT)
    .all<TopPostRow>();

  return buildTopViewedPosts(result.results ?? []);
}

async function countPublishedPosts(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'published'")
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function loadViewSnapshot(
  db: D1Database,
  options: { days?: number; now?: Date } = {},
): Promise<ViewSnapshot> {
  const now = options.now ?? new Date();
  const days = options.days && options.days > 0 ? Math.trunc(options.days) : 30;
  const today = viewDayKey(now);

  const rangeFrom = addViewDays(today, -(days - 1));
  const seriesRows = await loadDayCounts(db, rangeFrom, today);

  const weekFrom = addViewDays(today, -6);
  const weekPreviousFrom = addViewDays(today, -13);
  const weekPreviousTo = addViewDays(today, -7);
  const monthFrom = addViewDays(today, -29);
  const monthPreviousFrom = addViewDays(today, -59);
  const monthPreviousTo = addViewDays(today, -30);
  const yesterday = addViewDays(today, -1);

  const historyFrom = monthPreviousFrom;
  const historyRows = await loadDayCounts(db, historyFrom, today);
  const todayRows = await loadDayCounts(db, today, today);

  const byDay = new Map(seriesRows.map((row) => [row.day, row.total]));
  const series: ViewSeriesPoint[] = viewDaySeries(days, today).map((entry) => ({
    ...entry,
    views: byDay.get(entry.day) ?? 0,
  }));

  const [topPosts, publishedPosts] = await Promise.all([
    loadTopPosts(db, rangeFrom, today),
    countPublishedPosts(db),
  ]);

  const viewsInRange = series.reduce((total, point) => total + point.views, 0);
  const peakDay = series.reduce<ViewSeriesPoint | null>(
    (best, point) => (best === null || point.views > best.views ? point : best),
    null,
  );

  return {
    generatedAt: now.toISOString(),
    days,
    timeZone: VIEW_DAY_TIME_ZONE,
    today: buildViewTotals(
      sumViewCounts(todayRows, today, today),
      sumViewCounts(historyRows, yesterday, yesterday),
    ),
    week: buildViewTotals(
      sumViewCounts(historyRows, weekFrom, today),
      sumViewCounts(historyRows, weekPreviousFrom, weekPreviousTo),
    ),
    month: buildViewTotals(
      sumViewCounts(historyRows, monthFrom, today),
      sumViewCounts(historyRows, monthPreviousFrom, monthPreviousTo),
    ),
    series,
    topPosts,
    summary: {
      viewsInRange,
      viewsPerDay: days > 0 ? Math.round((viewsInRange / days) * 10) / 10 : 0,
      peakDay: peakDay && peakDay.views > 0 ? peakDay : null,
      publishedPosts,
      viewsPerPost: publishedPosts > 0 ? Math.round((viewsInRange / publishedPosts) * 10) / 10 : 0,
    },
    opportunities: selectOpportunities(topPosts),
  };
}
