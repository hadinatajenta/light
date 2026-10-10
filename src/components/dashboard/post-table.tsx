import { cn } from 'cn';
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { formatDate } from '@/utils/date';
import { DialogSurface } from './dialog-surface';

const PER_PAGE = 20;
const COLUMN_COUNT = 8;
const DASH = '-';
const SKELETON_ROWS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
  'skeleton-6',
];

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

type PostStatus = 'draft' | 'published' | 'archived';
type StatusFilter = 'all' | PostStatus;
type BulkAction = 'archive' | 'delete';

interface PostSummary {
  id: string;
  path: string;
  sha: string;
  title: string;
  status: PostStatus;
  category: string | null;
  tags: string[];
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
}

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_VARIANT: Record<PostStatus, 'default' | 'outline' | 'secondary'> = {
  draft: 'outline',
  published: 'default',
  archived: 'secondary',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
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

function StatusBadge({ status }: { status: PostStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground">{DASH}</span>;
  }

  const visibleTags = tags.slice(0, 2);
  const remaining = tags.length - visibleTags.length;

  return (
    <div className="flex items-center gap-1">
      {visibleTags.map((tag) => (
        <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">
          {tag}
        </Badge>
      ))}
      {remaining > 0 ? (
        <span className="text-xs tabular-nums text-muted-foreground">+{remaining}</span>
      ) : null}
    </div>
  );
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
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="size-8" />
          </TableCell>
        </TableRow>
      ))}
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
}: PostTableProps) {
  const [status, setStatus] = React.useState<StatusFilter>(initialStatus);
  const [category, setCategory] = React.useState(initialCategory);
  const [searchInput, setSearchInput] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery);
  const [page, setPage] = React.useState(initialPage);
  const [postsPage, setPostsPage] = React.useState<PostsPage>({
    posts: [],
    total: 0,
    page: initialPage,
    perPage: PER_PAGE,
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
      if (category) {
        params.set('category', category);
      }
      if (query) {
        params.set('q', query);
      }
      params.set('page', String(page));
      params.set('per_page', String(PER_PAGE));

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
  }, [status, category, query, page]);

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
    if (page > 1) {
      params.set('page', String(page));
    }
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
  }, [status, category, query, page]);

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

  const pageIds = postsPage.posts.map((post) => post.id);
  const isAllOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const isSomeOnPageSelected = pageIds.some((id) => selected.has(id));
  const selectedCount = selected.size;
  const isMutating = busyAction !== null;
  const hasActiveFilters = status !== 'all' || category !== '' || searchInput.trim() !== '';
  const isPaginationDisabled = isFetching || isMutating;

  const rangeStart = postsPage.total === 0 ? 0 : (postsPage.page - 1) * postsPage.perPage + 1;
  const rangeEnd =
    postsPage.total === 0 ? 0 : (postsPage.page - 1) * postsPage.perPage + postsPage.posts.length;
  const rangeLabel =
    postsPage.total === 0
      ? 'No posts'
      : `Showing ${rangeStart} to ${rangeEnd} of ${postsPage.total}`;

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

  const resolveCategoryLabel = (value: string | null): string => {
    if (!value) {
      return DASH;
    }
    return categoryLabels.get(value) ?? value;
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

  const openBulkConfirm = () => {
    setConfirmTargets(Array.from(selected, ([id, title]) => ({ id, title })));
    setConfirmScope('bulk');
    setConfirmIntent('archive');
    setConfirmOpen(true);
  };

  const executeConfirmed = async (action: BulkAction) => {
    if (isMutating || confirmTargets.length === 0) {
      return;
    }

    setBusyAction(action);

    try {
      if (confirmScope === 'row') {
        const target = confirmTargets[0];
        if (!target) {
          return;
        }
        if (action === 'archive') {
          await requestData(`/api/dashboard/posts/${encodeURIComponent(target.id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          });
        } else {
          await requestData(`/api/dashboard/posts/${encodeURIComponent(target.id)}`, {
            method: 'DELETE',
          });
        }
      } else {
        await requestData('/api/dashboard/posts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids: confirmTargets.map((target) => target.id) }),
        });
      }

      toast.success(buildResultMessage(action, confirmTargets.length));
      setConfirmOpen(false);
      setSelected(new Map());
      void loadPosts();
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value as StatusFilter);
    setPage(1);
  };

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(event.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setQuery('');
    setStatus('all');
    setCategory('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="posts-status-filter">Status</Label>
          <select
            id="posts-status-filter"
            className={SELECT_CLASS}
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="posts-category-filter">Category</Label>
          <select
            id="posts-category-filter"
            className={SELECT_CLASS}
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
              onClick={() => setSelected(new Map())}
              disabled={isMutating}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openBulkConfirm}
              disabled={isMutating}
              aria-label="Archive or delete selected posts"
            >
              <Trash2Icon />
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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead className="w-12">
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
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-10">
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

            {showRows
              ? postsPage.posts.map((post, index) => {
                  const rowNumber = (postsPage.page - 1) * postsPage.perPage + index + 1;
                  const isSelected = selected.has(post.id);
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
                            onChange={() => toggleSelection(post.id, post.title)}
                            disabled={isMutating}
                            aria-label={`Select ${post.title}`}
                          />
                        </label>
                      </TableCell>
                      <TableCell
                        className="max-w-[22rem] truncate font-medium text-foreground"
                        title={post.title}
                      >
                        {post.title}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={post.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {resolveCategoryLabel(post.category)}
                      </TableCell>
                      <TableCell>
                        <TagList tags={post.tags} />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatUpdatedDate(post.updatedDate)}
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
                              <a href={`/dashboard/posts/${encodeURIComponent(post.id)}/edit`}>
                                <PencilIcon />
                                Edit
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={post.status === 'archived' || isMutating}
                              onSelect={() => openRowConfirm(post, 'archive')}
                            >
                              <ArchiveIcon />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={isMutating}
                              onSelect={() => openRowConfirm(post, 'delete')}
                            >
                              <Trash2Icon />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>

      {showRows ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 tabular-nums">
            <span>{rangeLabel}</span>
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
