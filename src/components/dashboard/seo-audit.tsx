import {
  FileWarningIcon,
  InfoIcon,
  Link2Icon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import { formatAbsoluteTime, formatRelativeTime } from './research-notes';

const AUDIT_ENDPOINT = '/api/dashboard/seo/audit';
const CHECK_LINKS_ENDPOINT = '/api/dashboard/seo/check-links';
const ALL_FILTER = 'all';
const ERRORS_FILTER = 'errors';
const WARNINGS_FILTER = 'warnings';
const CLEAN_FILTER = 'clean';
const PAGE_SIZE = 10;

type AuditViewId = 'articles' | 'links' | 'opportunities';

type SortOption =
  | 'score-asc'
  | 'score-desc'
  | 'updated-desc'
  | 'updated-asc'
  | 'title-asc'
  | 'title-desc'
  | 'issues-desc';

type SeoIssueSeverity = 'error' | 'warning' | 'info';

interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
}

interface SeoPost {
  id: string;
  title: string;
  status: string;
  targetKeyword: string | null;
  intent: string | null;
  score: number;
  issues: SeoIssue[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  updatedAt: string | null;
  pubDate: string | null;
  isRefreshCandidate: boolean;
}

interface CannibalizationGroup {
  keyword: string;
  posts: Array<{ id: string; title: string }>;
}

interface OrphanPost {
  id: string;
  title: string;
}

interface BrokenLink {
  url: string;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  checkedAt: string;
}

interface SeoAuditSummary {
  total: number;
  published: number;
  withErrors: number;
  withWarnings: number;
  averageScore: number;
  orphans: number;
  cannibalized: number;
  refreshCandidates: number;
  brokenLinks: number;
}

interface SeoAuditReport {
  summary: SeoAuditSummary;
  posts: SeoPost[];
  cannibalization: CannibalizationGroup[];
  orphans: OrphanPost[];
  brokenLinks: BrokenLink[];
}

interface LinkCheckResult {
  checked: number;
  broken: number;
  remaining: number;
}

const SEVERITY_ORDER: SeoIssueSeverity[] = ['error', 'warning', 'info'];

const SEVERITY_LABEL: Record<SeoIssueSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};

const SEVERITY_BADGE_VARIANT: Record<SeoIssueSeverity, 'destructive' | 'secondary' | 'outline'> = {
  error: 'destructive',
  warning: 'secondary',
  info: 'outline',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  published: 'default',
  archived: 'secondary',
};

const VIEW_TABS: Array<{ id: AuditViewId; label: string }> = [
  { id: 'articles', label: 'Articles' },
  { id: 'links', label: 'Links' },
  { id: 'opportunities', label: 'Opportunities' },
];

const SUMMARY_METRICS: Array<{ key: keyof SeoAuditSummary; label: string }> = [
  { key: 'total', label: 'Total' },
  { key: 'published', label: 'Published' },
  { key: 'withErrors', label: 'Errors' },
  { key: 'withWarnings', label: 'Warnings' },
  { key: 'averageScore', label: 'Avg score' },
  { key: 'orphans', label: 'Orphans' },
  { key: 'cannibalized', label: 'Cannibalized' },
  { key: 'refreshCandidates', label: 'Refresh' },
  { key: 'brokenLinks', label: 'Broken links' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_FILTER, label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const SEVERITY_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_FILTER, label: 'All severities' },
  { value: ERRORS_FILTER, label: 'Has errors' },
  { value: WARNINGS_FILTER, label: 'Has warnings' },
  { value: CLEAN_FILTER, label: 'Clean' },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'score-asc', label: 'Score (low to high)' },
  { value: 'score-desc', label: 'Score (high to low)' },
  { value: 'updated-desc', label: 'Updated (newest)' },
  { value: 'updated-asc', label: 'Updated (oldest)' },
  { value: 'title-asc', label: 'Title (A to Z)' },
  { value: 'title-desc', label: 'Title (Z to A)' },
  { value: 'issues-desc', label: 'Issues (most first)' },
];

function toSeverityCounts(issues: SeoIssue[]): Record<SeoIssueSeverity, number> {
  const counts: Record<SeoIssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}

function formatIssueSummary(counts: Record<SeoIssueSeverity, number>): string {
  return `${counts.error} err / ${counts.warning} warn`;
}

function scoreBadgeVariant(score: number): 'default' | 'secondary' | 'destructive' {
  if (score >= 80) {
    return 'default';
  }
  if (score >= 50) {
    return 'secondary';
  }
  return 'destructive';
}

function toSortableTime(value: string | null): number {
  if (!value) {
    return 0;
  }
  const normalized = value.includes(' ') ? `${value.replace(' ', 'T')}Z` : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function comparePosts(left: SeoPost, right: SeoPost, sort: SortOption): number {
  switch (sort) {
    case 'score-asc':
      return left.score - right.score;
    case 'score-desc':
      return right.score - left.score;
    case 'updated-desc':
      return toSortableTime(right.updatedAt) - toSortableTime(left.updatedAt);
    case 'updated-asc':
      return toSortableTime(left.updatedAt) - toSortableTime(right.updatedAt);
    case 'title-asc':
      return left.title.localeCompare(right.title);
    case 'title-desc':
      return right.title.localeCompare(left.title);
    case 'issues-desc':
      return right.issues.length - left.issues.length;
    default:
      return 0;
  }
}

function matchesStatus(post: SeoPost, filter: string): boolean {
  return filter === ALL_FILTER || post.status === filter;
}

function matchesSeverity(post: SeoPost, filter: string): boolean {
  if (filter === ERRORS_FILTER) {
    return post.issues.some((issue) => issue.severity === 'error');
  }
  if (filter === WARNINGS_FILTER) {
    return post.issues.some((issue) => issue.severity === 'warning');
  }
  if (filter === CLEAN_FILTER) {
    return post.issues.length === 0;
  }
  return true;
}

function SeverityBadge({ severity }: { severity: SeoIssueSeverity }) {
  return <Badge variant={SEVERITY_BADGE_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

function PostStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 rounded-md border border-border px-3 py-1.5">
      <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="tabular-nums text-sm font-medium text-foreground">
        {value.toLocaleString('en-US')}
      </dd>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="whitespace-normal text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function Pagination({
  page,
  pageCount,
  onPrevious,
  onNext,
  label,
}: {
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={onPrevious}>
        Previous
      </Button>
      <span aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}

export default function SeoAudit() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] = useState<SeoAuditReport | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<AuditViewId>('articles');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [severityFilter, setSeverityFilter] = useState(ALL_FILTER);
  const [sortOption, setSortOption] = useState<SortOption>('score-asc');
  const [page, setPage] = useState(1);
  const [issuePost, setIssuePost] = useState<SeoPost | null>(null);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isCheckDialogOpen, setIsCheckDialogOpen] = useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [linkCheckResult, setLinkCheckResult] = useState<LinkCheckResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const tabRefs = useRef<Record<AuditViewId, HTMLButtonElement | null>>({
    articles: null,
    links: null,
    opportunities: null,
  });
  const searchInputId = useId();
  const statusSelectId = useId();
  const severitySelectId = useId();
  const sortSelectId = useId();

  const loadReport = useCallback(async (isSilent = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (isSilent) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
      setLoadError(null);
    }

    try {
      const payload = await requestJson<SeoAuditReport>(AUDIT_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setReport(payload);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (!isSilent) {
        setLoadError(toErrorMessage(error));
        setStatus('error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadReport();
    return () => controllerRef.current?.abort();
  }, [loadReport]);

  const posts = report?.posts ?? [];
  const cannibalization = report?.cannibalization ?? [];
  const orphans = report?.orphans ?? [];
  const brokenLinks = report?.brokenLinks ?? [];

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return posts
      .filter((post) => {
        if (!matchesStatus(post, statusFilter)) {
          return false;
        }
        if (!matchesSeverity(post, severityFilter)) {
          return false;
        }
        if (query.length === 0) {
          return true;
        }
        return (
          post.title.toLowerCase().includes(query) ||
          (post.targetKeyword ?? '').toLowerCase().includes(query)
        );
      })
      .sort((left, right) => comparePosts(left, right, sortOption));
  }, [posts, searchQuery, statusFilter, severityFilter, sortOption]);

  const refreshCandidates = useMemo(() => posts.filter((post) => post.isRefreshCandidate), [posts]);

  const pageCount = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedPosts = filteredPosts.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredPosts.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filteredPosts.length);

  const groupedIssues = useMemo(() => {
    const issues = issuePost?.issues ?? [];
    return SEVERITY_ORDER.map((severity) => ({
      severity,
      issues: issues.filter((issue) => issue.severity === severity),
    })).filter((group) => group.issues.length > 0);
  }, [issuePost]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = VIEW_TABS.findIndex((tab) => tab.id === activeView);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % VIEW_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = VIEW_TABS.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = VIEW_TABS[nextIndex].id;
    setActiveView(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handleOpenIssues = (post: SeoPost) => {
    setIssuePost(post);
    setIsIssueOpen(true);
  };

  const handleCheckLinks = async () => {
    if (isCheckingLinks) {
      return;
    }

    setIsCheckingLinks(true);

    try {
      const result = await requestJson<LinkCheckResult>(CHECK_LINKS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setLinkCheckResult(result);
      setIsCheckDialogOpen(false);
      toast.success(`Checked ${result.checked} links, found ${result.broken} broken.`);
      void loadReport(true);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsCheckingLinks(false);
    }
  };

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">Loading SEO audit</span>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'error' || !report) {
    return (
      <section
        aria-label="SEO"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the SEO audit</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadReport()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </section>
    );
  }

  const summary = report.summary;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">SEO</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Every post scored on keyword targeting, structure, and links. Fix what the audit flags
              to raise the average score.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              disabled={isRefreshing}
              onClick={() => void loadReport(true)}
            >
              <RefreshCwIcon className={cn(isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setIsCheckDialogOpen(true)}
            >
              <Link2Icon />
              Check links
            </Button>
          </div>
        </div>

        <p role="status" aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
          {isRefreshing
            ? 'Refreshing audit'
            : linkCheckResult
              ? `Checked ${linkCheckResult.checked} links, ${linkCheckResult.broken} broken, ${linkCheckResult.remaining} remaining.`
              : `${summary.total} ${summary.total === 1 ? 'article' : 'articles'} audited, ${summary.brokenLinks} broken.`}
        </p>
      </section>

      <section
        aria-label="SEO summary"
        className="rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <dl className="flex flex-wrap gap-2">
          {SUMMARY_METRICS.map((metric) => (
            <SummaryChip key={metric.key} label={metric.label} value={summary[metric.key]} />
          ))}
        </dl>
      </section>

      <div
        role="tablist"
        aria-label="SEO views"
        className="flex gap-1 rounded-lg border border-border p-1"
      >
        {VIEW_TABS.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`seo-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`seo-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
              onClick={() => setActiveView(tab.id)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="seo-panel-articles"
        aria-labelledby="seo-tab-articles"
        hidden={activeView !== 'articles'}
      >
        <section
          aria-label="Articles"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Articles</h3>
            <span
              role="status"
              aria-live="polite"
              className="text-xs tabular-nums text-muted-foreground"
            >
              {filteredPosts.length} of {posts.length} {posts.length === 1 ? 'article' : 'articles'}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={searchInputId}>Search articles</Label>
              <Input
                id={searchInputId}
                type="search"
                value={searchQuery}
                autoComplete="off"
                placeholder="Search title or target keyword"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={statusSelectId}>Status</Label>
                <select
                  id={statusSelectId}
                  className="select-control"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={severitySelectId}>Severity</Label>
                <select
                  id={severitySelectId}
                  className="select-control"
                  value={severityFilter}
                  onChange={(event) => {
                    setSeverityFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  {SEVERITY_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={sortSelectId}>Order by</Label>
                <select
                  id={sortSelectId}
                  className="select-control"
                  value={sortOption}
                  onChange={(event) => {
                    setSortOption(event.target.value as SortOption);
                    setPage(1);
                  }}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedPosts.length === 0 ? (
                <EmptyRow
                  colSpan={8}
                  message={
                    posts.length === 0
                      ? 'No articles have been audited yet.'
                      : 'No articles match the current filters.'
                  }
                />
              ) : (
                pagedPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="whitespace-normal">
                      <a
                        href={`/dashboard/posts/${encodeURIComponent(post.id)}/edit`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {post.title}
                      </a>
                    </TableCell>
                    <TableCell>
                      <PostStatusBadge status={post.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={scoreBadgeVariant(post.score)}>
                        <span className="tabular-nums">{post.score}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal tabular-nums text-muted-foreground">
                      {formatIssueSummary(toSeverityCounts(post.issues))}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {post.targetKeyword ?? 'None'}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {post.intent ?? 'None'}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      <time
                        dateTime={post.updatedAt ?? undefined}
                        title={post.updatedAt ? formatAbsoluteTime(post.updatedAt) : undefined}
                      >
                        {formatRelativeTime(post.updatedAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        aria-label={`View issues for ${post.title}`}
                        onClick={() => handleOpenIssues(post)}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3">
            <p className="text-xs tabular-nums text-muted-foreground">
              {filteredPosts.length === 0
                ? 'No articles to show'
                : `Showing ${rangeStart} to ${rangeEnd} of ${filteredPosts.length}`}
            </p>
            <Pagination
              label="Articles pagination"
              page={safePage}
              pageCount={pageCount}
              onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
              onNext={() => setPage((current) => Math.min(current + 1, pageCount))}
            />
          </div>
        </section>
      </div>

      <div
        role="tabpanel"
        id="seo-panel-links"
        aria-labelledby="seo-tab-links"
        hidden={activeView !== 'links'}
      >
        <section
          aria-label="Broken links"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Broken links</h3>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                External links that failed the last check. Re-run the check after you fix them.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setIsCheckDialogOpen(true)}
            >
              <Link2Icon />
              Check links
            </Button>
          </div>

          {linkCheckResult ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-md border border-border px-3 py-2 text-sm tabular-nums text-muted-foreground"
            >
              Checked {linkCheckResult.checked} links, found {linkCheckResult.broken} broken,{' '}
              {linkCheckResult.remaining} remaining.
            </p>
          ) : null}

          {brokenLinks.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
              <Link2Icon className="size-6 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">No broken links</p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  No external link failed the last check. Run a check to refresh this list.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Status code</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Checked at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokenLinks.map((link) => (
                  <TableRow key={link.url}>
                    <TableCell className="max-w-[24rem] whitespace-normal">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-medium text-foreground underline underline-offset-4"
                      >
                        {link.url}
                      </a>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {link.statusCode === null ? 'No response' : link.statusCode}
                    </TableCell>
                    <TableCell className="max-w-[16rem] whitespace-normal text-muted-foreground">
                      {link.error ? (
                        <span className="break-words" title={link.error}>
                          {link.error}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      <time dateTime={link.checkedAt} title={formatAbsoluteTime(link.checkedAt)}>
                        {formatRelativeTime(link.checkedAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <div
        role="tabpanel"
        id="seo-panel-opportunities"
        aria-labelledby="seo-tab-opportunities"
        hidden={activeView !== 'opportunities'}
      >
        <section
          aria-label="Opportunities"
          className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Refresh candidates</h3>
            <p className="max-w-prose text-sm text-muted-foreground">
              Posts that have gone stale or lost a keyword. Refresh the content before the topic
              date passes.
            </p>
            {refreshCandidates.length === 0 ? (
              <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                No posts need a refresh right now.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {refreshCandidates.map((post) => (
                  <li
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <a
                      href={`/dashboard/posts/${encodeURIComponent(post.id)}/edit`}
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {post.title}
                    </a>
                    <time
                      dateTime={post.updatedAt ?? undefined}
                      title={post.updatedAt ? formatAbsoluteTime(post.updatedAt) : undefined}
                      className="text-xs tabular-nums text-muted-foreground"
                    >
                      Updated {formatRelativeTime(post.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">Cannibalization</h3>
            <p className="max-w-prose text-sm text-muted-foreground">
              Keywords shared by more than one post. Competing posts split their ranking and usually
              need to be merged or retargeted.
            </p>
            {cannibalization.length === 0 ? (
              <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                No two posts target the same keyword.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {cannibalization.map((group) => (
                  <li key={group.keyword} className="flex flex-col gap-2 p-3">
                    <p className="text-sm font-medium text-foreground">{group.keyword}</p>
                    <ul className="flex flex-col gap-1">
                      {group.posts.map((post) => (
                        <li key={post.id}>
                          <a
                            href={`/dashboard/posts/${encodeURIComponent(post.id)}/edit`}
                            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {post.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">Orphans</h3>
            <p className="max-w-prose text-sm text-muted-foreground">
              Posts with no inbound internal links. Link them from a relevant post so crawlers can
              reach them.
            </p>
            {orphans.length === 0 ? (
              <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Every post has at least one inbound internal link.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {orphans.map((post) => (
                  <li key={post.id} className="p-3">
                    <a
                      href={`/dashboard/posts/${encodeURIComponent(post.id)}/edit`}
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {post.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <DialogPrimitive.Root open={isIssueOpen} onOpenChange={setIsIssueOpen}>
        <DialogSurface className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
              {issuePost?.title ?? 'Post issues'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Issues found by the SEO audit, grouped by severity.
            </DialogPrimitive.Description>
          </div>

          {groupedIssues.length === 0 ? (
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              This post has no issues.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedIssues.map((group) => (
                <div key={group.severity} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {group.severity === 'error' ? (
                      <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
                    ) : null}
                    {group.severity === 'warning' ? (
                      <FileWarningIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                    {group.severity === 'info' ? (
                      <InfoIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    ) : null}
                    <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
                      {SEVERITY_LABEL[group.severity]} ({group.issues.length})
                    </h3>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.issues.map((issue) => (
                      <li key={issue.code} className="flex items-start gap-2 text-sm">
                        <SeverityBadge severity={issue.severity} />
                        <span className="min-w-0 whitespace-normal text-foreground">
                          {issue.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DialogSurface>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={isCheckDialogOpen} onOpenChange={setIsCheckDialogOpen}>
        <DialogSurface>
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
              Check broken links
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              This checks every external link in your posts against the live web. It can take a
              moment and makes outbound requests.
            </DialogPrimitive.Description>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isCheckingLinks}
              onClick={() => setIsCheckDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isCheckingLinks}
              className="whitespace-nowrap"
              onClick={() => void handleCheckLinks()}
            >
              {isCheckingLinks ? <Loader2Icon className="animate-spin" /> : <Link2Icon />}
              {isCheckingLinks ? 'Checking' : 'Check links'}
            </Button>
          </div>
        </DialogSurface>
      </DialogPrimitive.Root>
    </div>
  );
}
