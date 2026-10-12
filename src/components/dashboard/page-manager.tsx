import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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

const PAGES_ENDPOINT = '/api/dashboard/pages';
const ALL_FILTER = 'all';
const PAGE_SIZE = 10;
const COLUMN_COUNT = 8;
const SKELETON_ROWS = ['page-skeleton-1', 'page-skeleton-2', 'page-skeleton-3', 'page-skeleton-4'];

type PageStatus = 'draft' | 'published';
type StatusFilter = 'all' | PageStatus;
type FooterFilter = 'all' | 'in-footer' | 'not-in-footer';
type SortOption =
  | 'order-asc'
  | 'order-desc'
  | 'updated-desc'
  | 'updated-asc'
  | 'title-asc'
  | 'title-desc';

interface PageRecord {
  id: string;
  title: string;
  description: string;
  body: string;
  status: PageStatus;
  seoTitle: string | null;
  canonical: string | null;
  noindex: boolean;
  showInFooter: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<PageStatus, string> = {
  draft: 'Draft',
  published: 'Published',
};

const STATUS_VARIANT: Record<PageStatus, 'default' | 'outline'> = {
  draft: 'outline',
  published: 'default',
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL_FILTER, label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

const FOOTER_FILTER_OPTIONS: Array<{ value: FooterFilter; label: string }> = [
  { value: ALL_FILTER, label: 'Any footer placement' },
  { value: 'in-footer', label: 'In the footer' },
  { value: 'not-in-footer', label: 'Not in the footer' },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'order-asc', label: 'Order (low to high)' },
  { value: 'order-desc', label: 'Order (high to low)' },
  { value: 'updated-desc', label: 'Updated (newest)' },
  { value: 'updated-asc', label: 'Updated (oldest)' },
  { value: 'title-asc', label: 'Title (A to Z)' },
  { value: 'title-desc', label: 'Title (Z to A)' },
];

function toSortableTime(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function comparePages(left: PageRecord, right: PageRecord, sortOption: SortOption): number {
  switch (sortOption) {
    case 'order-desc':
      return right.sortOrder - left.sortOrder || left.title.localeCompare(right.title);
    case 'updated-desc':
      return toSortableTime(right.updatedAt) - toSortableTime(left.updatedAt);
    case 'updated-asc':
      return toSortableTime(left.updatedAt) - toSortableTime(right.updatedAt);
    case 'title-asc':
      return left.title.localeCompare(right.title);
    case 'title-desc':
      return right.title.localeCompare(left.title);
    default:
      return left.sortOrder - right.sortOrder || left.title.localeCompare(right.title);
  }
}

function SkeletonRows() {
  return (
    <>
      {SKELETON_ROWS.map((rowKey) => (
        <TableRow key={rowKey}>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-8 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MessageRow({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={COLUMN_COUNT} className="h-40 whitespace-normal">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {children}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function PageManager() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_FILTER);
  const [footerFilter, setFooterFilter] = useState<FooterFilter>(ALL_FILTER);
  const [sortOption, setSortOption] = useState<SortOption>('order-asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PageRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const searchInputId = useId();
  const statusSelectId = useId();
  const footerSelectId = useId();
  const sortSelectId = useId();

  const loadPages = useCallback(async (isSilent = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (isSilent) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
    }
    setLoadError(null);

    try {
      const payload = await requestJson<{ pages: PageRecord[] }>(PAGES_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setPages(payload.pages);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      if (!isSilent) {
        setStatus('error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPages(false);
    return () => controllerRef.current?.abort();
  }, [loadPages]);

  const handleDelete = async () => {
    if (!deleteTarget || deletingId !== null) {
      return;
    }

    const target = deleteTarget;
    const snapshot = pages;
    setDeletingId(target.id);
    setPages((current) => current.filter((entry) => entry.id !== target.id));

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${PAGES_ENDPOINT}/${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      );
      toast.success(`Deleted ${target.title}.`);
    } catch (error) {
      setPages(snapshot);
      toast.error(toErrorMessage(error));
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  const filteredPages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matches = pages.filter((entry) => {
      if (statusFilter !== ALL_FILTER && entry.status !== statusFilter) {
        return false;
      }
      if (footerFilter === 'in-footer' && !entry.showInFooter) {
        return false;
      }
      if (footerFilter === 'not-in-footer' && entry.showInFooter) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return entry.title.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query);
    });

    return matches.sort((left, right) => comparePages(left, right, sortOption));
  }, [pages, searchQuery, statusFilter, footerFilter, sortOption]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== ALL_FILTER ||
    footerFilter !== ALL_FILTER ||
    sortOption !== 'order-asc';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter(ALL_FILTER);
    setFooterFilter(ALL_FILTER);
    setSortOption('order-asc');
    setCurrentPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(filteredPages.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const rangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredPages.length);
  const pagedPages = filteredPages.slice(rangeStart - 1, rangeEnd);
  const rangeLabel = `Showing ${rangeStart} to ${rangeEnd} of ${filteredPages.length}`;

  const isDeleting = deletingId !== null;
  const showSkeleton = status === 'loading' && pages.length === 0;
  const showErrorState = status === 'error' && pages.length === 0;
  const showEmpty = status === 'ready' && pages.length === 0;
  const showNoMatches = status === 'ready' && pages.length > 0 && filteredPages.length === 0;
  const showFilterBar = !showEmpty && !showErrorState;
  const showPagination = filteredPages.length > 0;
  const showInlineError = loadError !== null && pages.length > 0;

  return (
    <section className="flex flex-col gap-4" aria-label="Pages">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Pages
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Manage the standalone pages that live at the site root and in the footer.
          </p>
        </div>

        <Button asChild className="whitespace-nowrap">
          <a href="/dashboard/pages/new">
            <PlusIcon />
            New page
          </a>
        </Button>
      </div>

      {showFilterBar ? (
        <form
          aria-label="Filter pages"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={statusSelectId}>Status</Label>
            <Select
              id={statusSelectId}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setCurrentPage(1);
              }}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={footerSelectId}>Footer</Label>
            <Select
              id={footerSelectId}
              value={footerFilter}
              onChange={(event) => {
                setFooterFilter(event.target.value as FooterFilter);
                setCurrentPage(1);
              }}
            >
              {FOOTER_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={sortSelectId}>Order by</Label>
            <Select
              id={sortSelectId}
              value={sortOption}
              onChange={(event) => {
                setSortOption(event.target.value as SortOption);
                setCurrentPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
            <Label htmlFor={searchInputId}>Search</Label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={searchInputId}
                type="search"
                className="pl-9"
                autoComplete="off"
                placeholder="Search title or slug"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!hasActiveFilters}
            onClick={clearFilters}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </form>
      ) : null}

      {showInlineError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadPages(true)}
            disabled={isRefreshing}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-busy={isRefreshing}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>In footer</TableHead>
              <TableHead>Indexing</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isRefreshing && pages.length > 0 && 'opacity-60')}>
            {showSkeleton ? <SkeletonRows /> : null}

            {showErrorState ? (
              <MessageRow>
                <TriangleAlertIcon className="size-8 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-foreground">Could not load pages</p>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadPages()}>
                  <RefreshCwIcon />
                  Retry
                </Button>
              </MessageRow>
            ) : null}

            {showEmpty ? (
              <MessageRow>
                <FileTextIcon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">No pages yet</p>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    Create a page to publish it at a root URL and link it from the footer.
                  </p>
                </div>
                <Button asChild size="sm">
                  <a href="/dashboard/pages/new">
                    <PlusIcon />
                    New page
                  </a>
                </Button>
              </MessageRow>
            ) : null}

            {showNoMatches ? (
              <MessageRow>
                <FileTextIcon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    No pages match these filters
                  </p>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    Clear the search or the filters to see every page again.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </MessageRow>
            ) : null}

            {pagedPages.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="max-w-[22rem] truncate font-medium">
                  <a
                    href={`/dashboard/pages/${encodeURIComponent(entry.id)}/edit`}
                    title={entry.title}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {entry.title}
                  </a>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    /{entry.id}/
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    'tabular-nums',
                    entry.showInFooter ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {entry.showInFooter ? 'Yes' : 'No'}
                </TableCell>
                <TableCell
                  className={cn(
                    'tabular-nums',
                    entry.noindex ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {entry.noindex ? 'Noindex' : 'Indexable'}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {entry.sortOrder}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  <time dateTime={entry.updatedAt} title={formatAbsoluteTime(entry.updatedAt)}>
                    {formatRelativeTime(entry.updatedAt)}
                  </time>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon-sm">
                      <a
                        href={`/dashboard/pages/${encodeURIComponent(entry.id)}/edit`}
                        aria-label={`Edit ${entry.title}`}
                      >
                        <PencilIcon />
                      </a>
                    </Button>
                    {entry.status === 'published' ? (
                      <Button asChild variant="ghost" size="icon-sm">
                        <a
                          href={`/${entry.id}/`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${entry.title}`}
                        >
                          <ExternalLinkIcon />
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        aria-label={`${entry.title} is not published yet`}
                      >
                        <ExternalLinkIcon />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={isDeleting}
                      aria-label={`Delete ${entry.title}`}
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showPagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <span role="status" aria-live="polite" className="tabular-nums">
              {rangeLabel}
            </span>
            {isRefreshing ? (
              <span className="flex items-center gap-1 text-xs">
                <Loader2Icon className="size-3 animate-spin" />
                Updating
              </span>
            ) : null}
          </p>
          <nav aria-label="Pages pagination" className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(safePage - 1)}
            >
              <ChevronLeftIcon />
              Previous
            </Button>
            <span className="tabular-nums">
              Page {safePage} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => setCurrentPage(safePage + 1)}
            >
              Next
              <ChevronRightIcon />
            </Button>
          </nav>
        </div>
      ) : null}

      <DialogPrimitive.Root
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogSurface className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Delete page
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {deleteTarget
                ? `This permanently deletes "${deleteTarget.title}". Any link to it will return 404.`
                : 'This permanently deletes the page.'}
            </DialogPrimitive.Description>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Delete permanently
            </Button>
          </div>
        </DialogSurface>
      </DialogPrimitive.Root>
    </section>
  );
}
