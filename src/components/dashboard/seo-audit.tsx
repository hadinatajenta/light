import {
  ClockIcon,
  CopyIcon,
  FileWarningIcon,
  InfoIcon,
  Link2Icon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  UnlinkIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import { formatAbsoluteTime, formatRelativeTime } from './research-notes';

const AUDIT_ENDPOINT = '/api/dashboard/seo/audit';
const CHECK_LINKS_ENDPOINT = '/api/dashboard/seo/check-links';
const ALL_FILTER = 'all';
const ERRORS_FILTER = 'errors';
const WARNINGS_FILTER = 'warnings';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const SKELETON_STATS = [
  'stat-1',
  'stat-2',
  'stat-3',
  'stat-4',
  'stat-5',
  'stat-6',
  'stat-7',
  'stat-8',
  'stat-9',
];

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

function toSeverityCounts(issues: SeoIssue[]): Record<SeoIssueSeverity, number> {
  const counts: Record<SeoIssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}

function formatIssueCounts(counts: Record<SeoIssueSeverity, number>): string {
  const parts: string[] = [];
  if (counts.error > 0) {
    parts.push(`${counts.error} ${counts.error === 1 ? 'error' : 'errors'}`);
  }
  if (counts.warning > 0) {
    parts.push(`${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'}`);
  }
  if (parts.length === 0) {
    return 'None';
  }
  return parts.join(', ');
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

function SeverityBadge({ severity }: { severity: SeoIssueSeverity }) {
  return <Badge variant={SEVERITY_BADGE_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

function PostStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 tabular-nums text-foreground">{value.toLocaleString('en-US')}</dd>
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

export default function SeoAudit() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] = useState<SeoAuditReport | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState(ALL_FILTER);
  const [issuePost, setIssuePost] = useState<SeoPost | null>(null);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isCheckDialogOpen, setIsCheckDialogOpen] = useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [linkCheckResult, setLinkCheckResult] = useState<LinkCheckResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const searchInputId = useId();
  const severitySelectId = useId();

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

    return posts.filter((post) => {
      if (
        severityFilter === ERRORS_FILTER &&
        !post.issues.some((issue) => issue.severity === 'error')
      ) {
        return false;
      }
      if (
        severityFilter === WARNINGS_FILTER &&
        !post.issues.some((issue) => issue.severity === 'warning')
      ) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return (
        post.title.toLowerCase().includes(query) ||
        (post.targetKeyword ?? '').toLowerCase().includes(query)
      );
    });
  }, [posts, searchQuery, severityFilter]);

  const refreshCandidates = useMemo(() => posts.filter((post) => post.isRefreshCandidate), [posts]);

  const groupedIssues = useMemo(() => {
    const issues = issuePost?.issues ?? [];
    return SEVERITY_ORDER.map((severity) => ({
      severity,
      issues: issues.filter((issue) => issue.severity === severity),
    })).filter((group) => group.issues.length > 0);
  }, [issuePost]);

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
      <section
        aria-label="SEO audit"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading SEO audit</span>
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-2 sm:grid-cols-3">
          {SKELETON_STATS.map((statKey) => (
            <Skeleton key={statKey} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-4 w-64" />
      </section>
    );
  }

  if (status === 'error' || !report) {
    return (
      <section
        aria-label="SEO audit"
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
      <section
        aria-label="SEO audit summary"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <SearchIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">SEO audit</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Every post scored on keyword targeting, structure, and links. Fix the flagged posts to
              raise the average score.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard label="Total posts" value={summary.total} />
          <StatCard label="Published" value={summary.published} />
          <StatCard label="With errors" value={summary.withErrors} />
          <StatCard label="With warnings" value={summary.withWarnings} />
          <StatCard label="Average score" value={summary.averageScore} />
          <StatCard label="Orphans" value={summary.orphans} />
          <StatCard label="Cannibalized" value={summary.cannibalized} />
          <StatCard label="Refresh candidates" value={summary.refreshCandidates} />
          <StatCard label="Broken links" value={summary.brokenLinks} />
        </dl>
      </section>

      <section
        aria-label="Post scores"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Posts</h2>
          <span
            role="status"
            aria-live="polite"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {isRefreshing
              ? 'Updating'
              : `${filteredPosts.length} of ${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor={searchInputId}>Search posts</Label>
            <Input
              id={searchInputId}
              type="search"
              value={searchQuery}
              autoComplete="off"
              placeholder="Search title or target keyword"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={severitySelectId}>Severity</Label>
            <select
              id={severitySelectId}
              className={SELECT_CLASS}
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
            >
              <option value={ALL_FILTER}>All posts</option>
              <option value={ERRORS_FILTER}>Has errors</option>
              <option value={WARNINGS_FILTER}>Has warnings</option>
            </select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Target keyword</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPosts.length === 0 ? (
              <EmptyRow
                colSpan={8}
                message={
                  posts.length === 0
                    ? 'No posts have been audited yet.'
                    : 'No posts match the current filters.'
                }
              />
            ) : (
              filteredPosts.map((post) => (
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
                    {formatIssueCounts(toSeverityCounts(post.issues))}
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
      </section>

      <section
        aria-label="Keyword cannibalization"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <CopyIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Keyword cannibalization</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Keywords shared by more than one post. Competing posts split their ranking and usually
              need to be merged or retargeted.
            </p>
          </div>
        </div>

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
      </section>

      <section
        aria-label="Orphan posts"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <UnlinkIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Orphans</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Posts with no inbound internal links. Link them from a relevant post so crawlers can
              reach them.
            </p>
          </div>
        </div>

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
      </section>

      <section
        aria-label="Refresh candidates"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <ClockIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Refresh candidates</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Posts that have gone stale or lost a keyword. Refresh the content before the topic
              date passes.
            </p>
          </div>
        </div>

        {refreshCandidates.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No posts need a refresh right now.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {refreshCandidates.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
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
      </section>

      <section
        aria-label="Broken links"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link2Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground">Broken links</h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                External links that failed the last check. Re-run the check after you fix them.
              </p>
            </div>
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
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No broken links were found in the last check.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {brokenLinks.map((link) => (
              <li key={link.url} className="flex flex-col gap-1 p-3">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-foreground underline underline-offset-4"
                >
                  {link.url}
                </a>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {link.statusCode === null ? 'No response' : `Status ${link.statusCode}`}
                  {link.error ? ` - ${link.error}` : ''}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  <time dateTime={link.checkedAt} title={formatAbsoluteTime(link.checkedAt)}>
                    Checked {formatRelativeTime(link.checkedAt)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
