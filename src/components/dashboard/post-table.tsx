import { cn } from 'cn';
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageOffIcon,
  InboxIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { isScheduled } from '@/lib/scheduling/store';
import { formatDate } from '@/utils/date';
import { DialogSurface } from './dialog-surface';
import { formatRelativeTime } from './research-notes';

const DEFAULT_PER_PAGE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_SORT = 'updated_desc';
const COLUMN_COUNT = 10;
const PAGE_NUMBER_COLUMN_WIDTH = 'w-10';
const SELECT_COLUMN_WIDTH = 'w-12';
const ACTIONS_COLUMN_WIDTH = 'w-12';
const DASH = '\u2014';
const SKELETON_ROWS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
  'skeleton-6',
];

type PostStatus = 'draft' | 'published' | 'archived';
type PostDisplayStatus = PostStatus | 'scheduled';
type StatusFilter = 'all' | PostDisplayStatus;
type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'changes_requested' | 'none';
type ReviewFilter = ReviewStatus | 'all';
type PostSort = 'updated_desc' | 'updated_asc' | 'published_desc' | 'title_asc' | 'title_desc';
type BulkAction = 'archive' | 'delete';

interface PostSummary {
  id: string;
  path: string;
  sha: string;
  title: string;
  status: PostStatus;
  category: string | null;
  tags: string[];
  coverUrl?: string | null;
  coverAlt?: string | null;
  reviewStatus?: string | null;
  pubDate: string | null;
  updatedDate: string | null;
}

interface CategorySummary {
  slug: string;
  label: string;
  description: string;
  postCount: number;
}

interface PostsPayload {
  posts: PostSummary[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface CategoriesPayload {
  categories: CategorySummary[];
}

interface PostsPage {
  posts: PostSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

interface ConfirmTarget {
  id: string;
  title: string;
}

interface PostTableProps {
  initialStatus: StatusFilter;
  initialCategory: string;
  initialQuery: string;
  initialPage: number;
  initialReview?: ReviewFilter;
  initialSort?: PostSort;
  initialPerPage?: number;
}

interface SummaryCounts {
  total: number;
  perPage: number;
  page: number;
  visibleCount: number;
}

const STATUS_LABEL: Record<PostDisplayStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_VARIANT: Record<PostDisplayStatus, 'default' | 'outline' | 'secondary'> = {
  draft: 'outline',
  scheduled: 'secondary',
  published: 'default',
  archived: 'secondary',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: 'Pending',
  in_review: 'In review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  none: 'Not reviewed',
};

const REVIEW_VARIANT: Record<ReviewStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  in_review: 'secondary',
  approved: 'default',
  changes_requested: 'destructive',
  none: 'outline',
};

const REVIEW_OPTIONS: { value: ReviewFilter; label: string }[] = [
  { value: 'all', label: 'All reviews' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'none', label: 'Not reviewed' },
];

const SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'updated_asc', label: 'Least recently updated' },
  { value: 'published_desc', label: 'Newest published' },
  { value: 'title_asc', label: 'Title A to Z' },
  { value: 'title_desc', label: 'Title Z to A' },
];

class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...init, headers });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorBody = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const message =
      errorBody && typeof errorBody.message === 'string'
        ? errorBody.message
        : `The request failed with status ${response.status}.`;
    const code =
      errorBody && typeof errorBody.code === 'string' ? errorBody.code : 'REQUEST_FAILED';
    throw new ApiRequestError(message, response.status, code);
  }

  if (!isRecord(payload) || !('data' in payload)) {
    throw new ApiRequestError(
      'The server returned an unexpected response.',
      response.status,
      'INVALID_RESPONSE',
    );
  }

  return payload.data as T;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function resolveReviewStatus(value: string | null | undefined): ReviewStatus | null {
  if (
    value === 'pending' ||
    value === 'in_review' ||
    value === 'approved' ||
    value === 'changes_requested'
  ) {
    return value;
  }
  return null;
}

function resolveStatusFilter(value: string): StatusFilter {
  if (value === 'draft' || value === 'scheduled' || value === 'published' || value === 'archived') {
    return value;
  }
  return 'all';
}

function resolveReviewFilter(value: string): ReviewFilter {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'changes_requested' ||
    value === 'none'
  ) {
    return value;
  }
  return 'all';
}

function resolveSort(value: string): PostSort {
  if (
    value === 'updated_asc' ||
    value === 'published_desc' ||
    value === 'title_asc' ||
    value === 'title_desc'
  ) {
    return value;
  }
  return 'updated_desc';
}

function resolvePerPage(value: number): number {
  return PER_PAGE_OPTIONS.includes(value as (typeof PER_PAGE_OPTIONS)[number])
    ? value
    : DEFAULT_PER_PAGE;
}

function formatUpdatedDate(value: string | null): string {
  if (!value) {
    return DASH;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return DASH;
  }
  return formatDate(parsed);
}

function buildResultMessage(action: BulkAction, count: number): string {
  const noun = count === 1 ? 'post' : 'posts';
  return action === 'archive' ? `Archived ${count} ${noun}.` : `Deleted ${count} ${noun}.`;
}

function editsFor(id: string): string {
  return `/dashboard/posts/${encodeURIComponent(id)}/edit`;
}

function StatusBadge({
  status,
  pubDate,
  now,
}: {
  status: PostStatus;
  pubDate: string | null;
  now: Date;
}) {
  const displayStatus: PostDisplayStatus = isScheduled(status, pubDate, now) ? 'scheduled' : status;
  return <Badge variant={STATUS_VARIANT[displayStatus]}>{STATUS_LABEL[displayStatus]}</Badge>;
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge variant={REVIEW_VARIANT[status]}>{REVIEW_LABEL[status]}</Badge>;
}

function CoverThumbnail({ url, alt }: { url?: string | null; alt: string }) {
  const [hasError, setHasError] = React.useState(false);

  if (!url || hasError) {
    return (
      <span
        className="grid h-10 w-14 place-items-center rounded border border-dashed border-border text-muted-foreground"
        aria-hidden="true"
      >
        <ImageOffIcon className="size-4" />
      </span>
    );
  }

  return (
    <span className="block h-10 w-14 overflow-hidden rounded border border-border bg-muted">
      <img
        src={url}
        alt={alt}
        width={56}
        height={40}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setHasError(true)}
      />
    </span>
  );
}

function TagCount({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground">{DASH}</span>;
  }

  return <span className="tabular-nums text-muted-foreground">{tags.length}</span>;
}

function SummaryCounts({ total, perPage, page, visibleCount }: SummaryCounts) {
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = total === 0 ? 0 : (page - 1) * perPage + visibleCount;

  if (total === 0) {
    return <>{`Showing ${DASH}`}</>;
  }

  return <>{`Showing ${rangeStart} to ${rangeEnd} of ${total}`}</>;
}

function SkeletonRows() {
  return (
    <>
      {SKELETON_ROWS.map((rowKey) => (
        <TableRow key={rowKey}>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-6" />
          </TableCell>
          <TableCell>
            <Skeleton className="size-4" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-10 w-14 rounded" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-6" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto size-8" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface PostTableRowsProps {
  postsPage: PostsPage;
  selected: Map<string, string>;
  categoryLabels: Map<string, string>;
  now: Date;
  isMutating: boolean;
  onToggleSelection: (id: string, title: string) => void;
  onOpenRowConfirm: (post: PostSummary, intent: BulkAction) => void;
}

function PostTableRows({
  postsPage,
  selected,
  categoryLabels,
  now,
  isMutating,
  onToggleSelection,
  onOpenRowConfirm,
}: PostTableRowsProps) {
  return (
    <>
      {postsPage.posts.map((post, index) => {
        const rowNumber = (postsPage.page - 1) * postsPage.perPage + index + 1;
        const isSelected = selected.has(post.id);
        const reviewStatus = resolveReviewStatus(post.reviewStatus);
        const updatedLabel = formatRelativeTime(post.updatedDate);
        const categoryLabel = post.category
          ? (categoryLabels.get(post.category) ?? post.category)
          : DASH;
        const coverAlt = post.coverAlt?.trim() || post.title;

        return (
          <TableRow key={post.id} data-state={isSelected ? 'selected' : undefined}>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {rowNumber}
            </TableCell>
            <TableCell>
              <label className="-m-2 grid size-11 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input accent-primary"
                  checked={isSelected}
                  onChange={() => onToggleSelection(post.id, post.title)}
                  disabled={isMutating}
                  aria-label={`Select ${post.title}`}
                />
              </label>
            </TableCell>
            <TableCell>
              <CoverThumbnail url={post.coverUrl} alt={coverAlt} />
            </TableCell>
            <TableCell className="group/title relative max-w-[22rem]">
              <a href={editsFor(post.id)} className="absolute inset-0 focus-visible:outline-none">
                <span className="sr-only">{post.title}</span>
              </a>
              <span
                className="block truncate font-medium text-foreground group-hover/title:underline group-hover/title:underline-offset-4"
                title={post.title}
              >
                {post.title}
              </span>
            </TableCell>
            <TableCell aria-current="true">
              <StatusBadge status={post.status} pubDate={post.pubDate} now={now} />
            </TableCell>
            <TableCell>
              {post.status === 'draft' ? (
                reviewStatus ? (
                  <ReviewBadge status={reviewStatus} />
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {REVIEW_LABEL.none}
                  </Badge>
                )
              ) : (
                <span className="text-muted-foreground">{DASH}</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{categoryLabel}</TableCell>
            <TableCell>
              <TagCount tags={post.tags} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {post.updatedDate ? (
                <time dateTime={post.updatedDate} title={formatUpdatedDate(post.updatedDate)}>
                  {updatedLabel}
                </time>
              ) : (
                DASH
              )}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isMutating}
                    aria-label={`Actions for ${post.title}`}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={editsFor(post.id)}>
                      <PencilIcon />
                      Edit
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={post.status === 'archived' || isMutating}
                    onSelect={() => onOpenRowConfirm(post, 'archive')}
                  >
                    <ArchiveIcon />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={isMutating}
                    onSelect={() => onOpenRowConfirm(post, 'delete')}
                  >
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  targets: ConfirmTarget[];
  intent: BulkAction;
  busyAction: BulkAction | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: BulkAction) => void;
}

function ConfirmDialog({
  open,
  targets,
  intent,
  busyAction,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const isBusy = busyAction !== null;
  const count = targets.length;
  const noun = count === 1 ? 'post' : 'posts';

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isBusy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Confirm action
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            This affects {count} {noun}. Archive the content or delete it permanently.
          </DialogPrimitive.Description>
        </div>

        <ul className="max-h-48 overflow-y-auto rounded-md border border-border bg-card p-2 text-sm">
          {targets.map((target) => (
            <li key={target.id} className="truncate px-2 py-1 text-foreground" title={target.title}>
              {target.title}
            </li>
          ))}
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogPrimitive.Close asChild>
            <Button type="button" variant="ghost" disabled={isBusy}>
              Cancel
            </Button>
          </DialogPrimitive.Close>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            autoFocus={intent === 'archive'}
            onClick={() => onConfirm('archive')}
          >
            {busyAction === 'archive' ? <Loader2Icon className="animate-spin" /> : <ArchiveIcon />}
            Archive
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isBusy}
            autoFocus={intent === 'delete'}
            onClick={() => onConfirm('delete')}
          >
            {busyAction === 'delete' ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            Delete permanently
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

export default function PostTable({
  initialStatus,
  initialCategory,
  initialQuery,
  initialPage,
  initialReview = 'all',
  initialSort = DEFAULT_SORT,
  initialPerPage = DEFAULT_PER_PAGE,
}: PostTableProps) {
  const [status, setStatus] = React.useState<StatusFilter>(initialStatus);
  const [review, setReview] = React.useState<ReviewFilter>(initialReview);
  const [sort, setSort] = React.useState<PostSort>(initialSort);
  const [category, setCategory] = React.useState(initialCategory);
  const [searchInput, setSearchInput] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery);
  const [page, setPage] = React.useState(initialPage);
  const [pageSize, setPageSize] = React.useState(resolvePerPage(initialPerPage));
  const [postsPage, setPostsPage] = React.useState<PostsPage>({
    posts: [],
    total: 0,
    page: initialPage,
    perPage: resolvePerPage(initialPerPage),
    totalPages: 1,
  });
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [categories, setCategories] = React.useState<CategorySummary[]>([]);
  const [hasCategoryError, setHasCategoryError] = React.useState(false);
  const [selected, setSelected] = React.useState<Map<string, string>>(new Map());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmTargets, setConfirmTargets] = React.useState<ConfirmTarget[]>([]);
  const [confirmScope, setConfirmScope] = React.useState<'row' | 'bulk'>('bulk');
  const [confirmIntent, setConfirmIntent] = React.useState<BulkAction>('archive');
  const [busyAction, setBusyAction] = React.useState<BulkAction | null>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const listAbortRef = React.useRef<AbortController | null>(null);
  const latestRequestRef = React.useRef(0);

  const loadPosts = React.useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setIsFetching(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();
      params.set('status', status);
      params.set('review', review);
      params.set('sort', sort);
      if (category) {
        params.set('category', category);
      }
      if (query) {
        params.set('q', query);
      }
      params.set('page', String(page));
      params.set('per_page', String(pageSize));

      const payload = await requestData<PostsPayload>(`/api/dashboard/posts?${params.toString()}`, {
        signal: controller.signal,
      });

      if (latestRequestRef.current !== requestId) {
        return;
      }

      setPostsPage({
        posts: payload.posts,
        total: payload.total,
        page: payload.page,
        perPage: payload.per_page,
        totalPages: payload.total_pages,
      });
      setHasLoaded(true);

      if (payload.page !== page) {
        setPage(payload.page);
      }
      if (payload.per_page !== pageSize) {
        setPageSize(resolvePerPage(payload.per_page));
      }
    } catch (error) {
      if (latestRequestRef.current !== requestId || isAbortError(error)) {
        return;
      }
      setLoadError(resolveErrorMessage(error));
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsFetching(false);
      }
    }
  }, [status, review, sort, category, query, page, pageSize]);

  React.useEffect(() => {
    void loadPosts();
    return () => listAbortRef.current?.abort();
  }, [loadPosts]);

  React.useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    const loadCategories = async () => {
      try {
        const payload = await requestData<CategoriesPayload>('/api/dashboard/categories', {
          signal: controller.signal,
        });
        if (isActive) {
          setCategories(payload.categories);
          setHasCategoryError(false);
        }
      } catch (error) {
        if (!isActive || isAbortError(error)) {
          return;
        }
        setHasCategoryError(true);
      }
    };

    void loadCategories();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    if (searchInput.trim() === query) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput, query]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (status !== 'all') {
      params.set('status', status);
    }
    if (category) {
      params.set('category', category);
    }
    if (query) {
      params.set('q', query);
    }
    if (review !== 'all') {
      params.set('review', review);
    }
    if (sort !== DEFAULT_SORT) {
      params.set('sort', sort);
    }
    if (page > 1) {
      params.set('page', String(page));
    }
    if (pageSize !== DEFAULT_PER_PAGE) {
      params.set('per_page', String(pageSize));
    }
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
  }, [status, category, query, review, sort, page, pageSize]);

  const categoryLabels = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const categoryItem of categories) {
      labels.set(categoryItem.slug, categoryItem.label);
    }
    return labels;
  }, [categories]);

  const categoryOptions = React.useMemo(() => {
    const options = categories.map((categoryItem) => ({
      value: categoryItem.slug,
      label: categoryItem.label,
    }));
    if (category && !options.some((option) => option.value === category)) {
      options.unshift({ value: category, label: category });
    }
    return options;
  }, [categories, category]);

  const pageIds = React.useMemo(() => postsPage.posts.map((post) => post.id), [postsPage.posts]);
  const isAllOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const isSomeOnPageSelected = pageIds.some((id) => selected.has(id));
  const selectedCount = selected.size;
  const isMutating = busyAction !== null;
  const hasActiveFilters =
    status !== 'all' ||
    review !== 'all' ||
    sort !== DEFAULT_SORT ||
    category !== '' ||
    searchInput.trim() !== '';
  const isPaginationDisabled = isFetching || isMutating;
  const scheduleNow = new Date();

  const showInitialSkeleton = !hasLoaded && isFetching;
  const showErrorState = loadError !== null && postsPage.posts.length === 0;
  const showEmpty = hasLoaded && !isFetching && !loadError && postsPage.posts.length === 0;
  const showRows = !showInitialSkeleton && !showErrorState && !showEmpty;

  React.useEffect(() => {
    const node = selectAllRef.current;
    if (node) {
      node.indeterminate = isSomeOnPageSelected && !isAllOnPageSelected;
    }
  }, [isSomeOnPageSelected, isAllOnPageSelected]);

  const reload = () => {
    void loadPosts();
  };

  const toggleSelection = (id: string, title: string) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, title);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (pageIds.every((id) => next.has(id))) {
        for (const id of pageIds) {
          next.delete(id);
        }
      } else {
        for (const post of postsPage.posts) {
          next.set(post.id, post.title);
        }
      }
      return next;
    });
  };

  const openRowConfirm = (post: PostSummary, intent: BulkAction) => {
    setConfirmTargets([{ id: post.id, title: post.title }]);
    setConfirmScope('row');
    setConfirmIntent(intent);
    setConfirmOpen(true);
  };

  const openBulkConfirm = (intent: BulkAction) => {
    setConfirmTargets(Array.from(selected, ([id, title]) => ({ id, title })));
    setConfirmScope('bulk');
    setConfirmIntent(intent);
    setConfirmOpen(true);
  };

  const applyOptimisticStatus = (ids: string[], statusValue: PostSummary['status']) => {
    const target = new Set(ids);
    setPostsPage((previous) => ({
      ...previous,
      posts: previous.posts.map((post) =>
        target.has(post.id) ? { ...post, status: statusValue } : post,
      ),
    }));
  };

  const applyOptimisticDelete = (ids: string[]) => {
    const target = new Set(ids);
    setPostsPage((previous) => {
      const remaining = previous.posts.filter((post) => !target.has(post.id));
      return {
        ...previous,
        posts: remaining,
        total: Math.max(0, previous.total - (previous.posts.length - remaining.length)),
      };
    });
  };

  const executeConfirmed = async (action: BulkAction) => {
    if (isMutating || confirmTargets.length === 0) {
      return;
    }

    const ids = confirmTargets.map((target) => target.id);
    const total = ids.length;
    const scope = confirmScope;

    if (action === 'delete') {
      applyOptimisticDelete(ids);
    } else {
      applyOptimisticStatus(ids, 'archived');
    }

    setConfirmOpen(false);
    setSelected(new Map());
    setBusyAction(action);

    let failedCount = 0;

    try {
      if (scope === 'row') {
        const target = ids[0];
        if (!target) {
          return;
        }

        if (action === 'archive') {
          await requestData(`/api/dashboard/posts/${encodeURIComponent(target)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          });
        } else {
          await requestData(`/api/dashboard/posts/${encodeURIComponent(target)}`, {
            method: 'DELETE',
          });
        }
      } else {
        const result = (await requestData('/api/dashboard/posts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
        })) as { failed?: unknown[] };

        failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
      }

      if (failedCount > 0) {
        toast.error(`${failedCount} of ${total} could not be updated. Try again.`);
      } else {
        toast.success(buildResultMessage(action, total));
      }
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    } finally {
      setBusyAction(null);
      void loadPosts();
    }
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(resolveStatusFilter(event.target.value));
    setPage(1);
  };

  const handleReviewChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setReview(resolveReviewFilter(event.target.value));
    setPage(1);
  };

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSort(resolveSort(event.target.value));
    setPage(1);
  };

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(event.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(resolvePerPage(Number.parseInt(event.target.value, 10)));
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setQuery('');
    setStatus('all');
    setReview('all');
    setSort(DEFAULT_SORT);
    setCategory('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="posts-search">Search</Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="posts-search"
              type="search"
              className="pl-9"
              placeholder="Search by title or slug"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              disabled={isMutating}
            />
          </div>
        </div>

        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <Label htmlFor="posts-status-filter">Status</Label>
          <select
            id="posts-status-filter"
            className="select-control"
            value={status}
            onChange={handleStatusChange}
            disabled={isMutating}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <Label htmlFor="posts-review-filter">Review</Label>
          <select
            id="posts-review-filter"
            className="select-control"
            value={review}
            onChange={handleReviewChange}
            disabled={isMutating}
          >
            {REVIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <Label htmlFor="posts-category-filter">Category</Label>
          <select
            id="posts-category-filter"
            className="select-control"
            value={category}
            onChange={handleCategoryChange}
            disabled={isMutating}
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <Label htmlFor="posts-sort-filter">Sort</Label>
          <select
            id="posts-sort-filter"
            className="select-control"
            value={sort}
            onChange={handleSortChange}
            disabled={isMutating}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[7rem] flex-col gap-1.5">
          <Label htmlFor="posts-page-size">Per page</Label>
          <select
            id="posts-page-size"
            className="select-control"
            value={String(pageSize)}
            onChange={handlePageSizeChange}
            disabled={isMutating}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={handleResetFilters}
          disabled={!hasActiveFilters || isMutating}
        >
          <RotateCcwIcon />
          Reset
        </Button>

        {hasCategoryError ? (
          <p className="w-full text-xs text-muted-foreground">
            Category names are unavailable right now.
          </p>
        ) : null}
      </form>

      {selectedCount > 0 ? (
        <section
          aria-label="Bulk actions"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
        >
          <span className="text-sm font-medium tabular-nums text-foreground">
            {selectedCount} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setSelected(new Map())}
              disabled={isMutating}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => openBulkConfirm('archive')}
              disabled={isMutating}
            >
              <ArchiveIcon />
              Archive selected
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => openBulkConfirm('delete')}
              disabled={isMutating}
            >
              <Trash2Icon />
              Delete selected
            </Button>
          </div>
        </section>
      ) : null}

      {loadError !== null && postsPage.posts.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={cn(PAGE_NUMBER_COLUMN_WIDTH, 'text-right')}>
                <span className="sr-only">Row number</span>
                <span aria-hidden="true">#</span>
              </TableHead>
              <TableHead className={SELECT_COLUMN_WIDTH}>
                <label className="-m-2 grid size-11 cursor-pointer place-items-center">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={isAllOnPageSelected}
                    onChange={toggleSelectAll}
                    disabled={isMutating || pageIds.length === 0}
                    aria-label="Select all posts on this page"
                  />
                </label>
              </TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Cover</span>
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className={cn(ACTIONS_COLUMN_WIDTH, 'text-right')}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isFetching && postsPage.posts.length > 0 && 'opacity-60')}>
            {showInitialSkeleton ? <SkeletonRows /> : null}

            {showErrorState ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <TriangleAlertIcon className="size-8 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Could not load posts</p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={reload}>
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showEmpty ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <InboxIcon className="size-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {hasActiveFilters ? 'No posts match your filters' : 'No posts yet'}
                      </p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                        {hasActiveFilters
                          ? 'Adjust or reset the filters to see more results.'
                          : 'Create your first post to see it listed here.'}
                      </p>
                    </div>
                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleResetFilters}
                      >
                        Reset filters
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showRows ? (
              <PostTableRows
                postsPage={postsPage}
                selected={selected}
                categoryLabels={categoryLabels}
                now={scheduleNow}
                isMutating={isMutating}
                onToggleSelection={toggleSelection}
                onOpenRowConfirm={openRowConfirm}
              />
            ) : null}
          </TableBody>
        </Table>
      </div>

      {showRows ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 tabular-nums">
            <SummaryCounts
              total={postsPage.total}
              perPage={postsPage.perPage}
              page={postsPage.page}
              visibleCount={postsPage.posts.length}
            />
            {isFetching && hasLoaded ? (
              <span className="flex items-center gap-1 text-xs" aria-live="polite">
                <Loader2Icon className="size-3 animate-spin" />
                Updating
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={isPaginationDisabled || postsPage.page <= 1}
            >
              <ChevronLeftIcon />
              Previous
            </Button>
            <span className="tabular-nums">
              Page {postsPage.page} of {postsPage.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(postsPage.totalPages, current + 1))}
              disabled={isPaginationDisabled || postsPage.page >= postsPage.totalPages}
            >
              Next
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        targets={confirmTargets}
        intent={confirmIntent}
        busyAction={busyAction}
        onOpenChange={setConfirmOpen}
        onConfirm={executeConfirmed}
      />
    </div>
  );
}
