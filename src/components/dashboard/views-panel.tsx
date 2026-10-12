import {
  EyeIcon,
  Loader2Icon,
  MousePointerClickIcon,
  RefreshCwIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TopViewedPost, ViewSnapshot, ViewTotals } from '@/lib/analytics/views';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';
import { ChartPanel, type ChartVariant } from './chart-panel';

const VIEWS_ENDPOINT = '/api/dashboard/views';
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const;

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function formatChange(percent: number | null): string {
  if (percent === null) {
    return 'no earlier data';
  }

  if (percent === 0) {
    return 'no change';
  }

  return `${percent > 0 ? '+' : ''}${percent}% vs previous period`;
}

function formatClickRate(rate: number | null): string {
  if (rate === null) {
    return 'No views yet';
  }

  return `${rate}%`;
}

function StatCard({ label, totals }: { label: string; totals: ViewTotals }) {
  const isUp = totals.changePercent !== null && totals.changePercent > 0;
  const isDown = totals.changePercent !== null && totals.changePercent < 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-2xl font-medium tabular-nums">{formatCount(totals.views)}</p>
      <p
        className={cn(
          'mt-1 inline-flex items-center gap-1 text-xs tabular-nums',
          isUp ? 'text-chart-2' : isDown ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {isUp ? <TrendingUpIcon className="size-3.5" aria-hidden="true" /> : null}
        {isDown ? <TrendingDownIcon className="size-3.5" aria-hidden="true" /> : null}
        {formatChange(totals.changePercent)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        Previous: {formatCount(totals.previousViews)}
      </p>
    </div>
  );
}

function PostTable({ posts, rangeLabel }: { posts: TopViewedPost[]; rangeLabel: string }) {
  if (posts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        No article views recorded in the last {rangeLabel}. Views start counting from the moment
        this feature went live, so an empty table is expected on the first day.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Articles ordered by views over the last {rangeLabel}, with affiliate clicks and the click
          rate
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">
              Article
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Views
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Clicks
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Click rate
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.postId} className="border-b border-border last:border-b-0">
              <th scope="row" className="max-w-0 py-2.5 pr-3 text-left font-normal">
                <a
                  href={`/dashboard/posts/${post.postId}/edit`}
                  className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {post.title}
                </a>
                {post.category ? (
                  <span className="text-xs text-muted-foreground">{post.category}</span>
                ) : null}
              </th>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(post.views)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(post.clicks)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatClickRate(post.clickRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityList({
  title,
  description,
  posts,
  tone,
}: {
  title: string;
  description: string;
  posts: TopViewedPost[];
  tone: 'warning' | 'good';
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {posts.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nothing to report in this range.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.postId} className="flex items-baseline gap-2 text-sm">
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  tone === 'warning' ? 'bg-chart-3' : 'bg-chart-2',
                )}
                aria-hidden="true"
              />
              <a
                href={`/dashboard/posts/${post.postId}/edit`}
                className="min-w-0 flex-1 truncate text-foreground underline-offset-4 hover:underline"
              >
                {post.title}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatCount(post.views)} views · {formatCount(post.clicks)} clicks
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ViewsPanel({ initial }: { initial: ViewSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [days, setDays] = useState(initial.days);
  const [variant, setVariant] = useState<ChartVariant>('bar');
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready');
  const [loadError, setLoadError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSnapshot = useCallback(async (nextDays: number) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<ViewSnapshot>(`${VIEWS_ENDPOINT}?days=${nextDays}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setSnapshot(payload);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const rangeLabel = `${days} days`;
  const chartDataset = {
    id: `${days}d`,
    label: rangeLabel,
    values: snapshot.series.map((point) => point.views),
    axisLabels: snapshot.series.map((point) => ({ id: point.day, label: point.label })),
  };

  return (
    <section aria-label="Article views" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Article views
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Counted server side, one row per article per day, in {snapshot.timeZone}. Crawler
            traffic that identifies itself is excluded; treat the numbers as a direction, not an
            absolute.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <legend className="sr-only">Range</legend>
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                aria-pressed={range.days === days}
                onClick={() => {
                  setDays(range.days);
                  void loadSnapshot(range.days);
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  range.days === days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {range.label}
              </button>
            ))}
          </fieldset>

          {status === 'loading' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              Loading
            </span>
          ) : null}
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {status === 'ready'
          ? `Showing the last ${rangeLabel}. ${formatCount(snapshot.today.views)} views today.`
          : ''}
      </span>

      {status === 'error' ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void loadSnapshot(days)}
          >
            <RefreshCwIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Today" totals={snapshot.today} />
        <StatCard label="Last 7 days" totals={snapshot.week} />
        <StatCard label="Last 30 days" totals={snapshot.month} />
      </div>

      <div
        className={cn('transition-opacity', status === 'loading' ? 'opacity-60' : 'opacity-100')}
      >
        <ChartPanel
          datasets={[chartDataset]}
          defaultDatasetId={`${days}d`}
          title="Views per day"
          ariaLabel="Article views per day"
          unitLabel="views"
          unitSingular="view"
          metricLabel="recorded"
          variant={variant}
          onVariantChange={setVariant}
        />
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
            Average per day
          </p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {formatCount(snapshot.summary.viewsPerDay)}
          </p>
        </div>
        <div>
          <p className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
            Average per published article
          </p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {formatCount(snapshot.summary.viewsPerPost)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({snapshot.summary.publishedPosts} articles)
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Busiest day</p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {snapshot.summary.peakDay
              ? `${snapshot.summary.peakDay.label} · ${formatCount(snapshot.summary.peakDay.views)}`
              : 'No views yet'}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <EyeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">Most viewed articles</h3>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            Last {rangeLabel}
          </span>
        </div>
        <div className="mt-3">
          {status === 'loading' && snapshot.topPosts.length === 0 ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : (
            <PostTable posts={snapshot.topPosts} rangeLabel={rangeLabel} />
          )}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <OpportunityList
          title="Read but not clicked"
          description="Articles that attract readers and earn no affiliate clicks. Usually a missing or weak product list."
          posts={snapshot.opportunities.noClicks}
          tone="warning"
        />
        <OpportunityList
          title="Best converting"
          description="The highest click rate per view. Worth copying the structure and the product placement."
          posts={snapshot.opportunities.bestClickRate}
          tone="good"
        />
      </div>

      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <MousePointerClickIcon className="size-3.5" aria-hidden="true" />
        Click rate is affiliate clicks on an article divided by its views. It measures interest, not
        sales, because Amazon does not report orders back to the site.
      </p>
    </section>
  );
}
