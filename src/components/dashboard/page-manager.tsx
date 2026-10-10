import {
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatDate } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const PAGES_ENDPOINT = '/api/dashboard/pages';
const SKELETON_ROWS = ['page-skeleton-1', 'page-skeleton-2', 'page-skeleton-3', 'page-skeleton-4'];

type PageStatus = 'draft' | 'published';

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

function formatUpdatedDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : formatDate(parsed);
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
            <Skeleton className="h-5 w-28 rounded" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
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

export default function PageManager() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

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

  const isDeleting = deletingId !== null;
  const showSkeleton = status === 'loading' && pages.length === 0;
  const showErrorState = status === 'error' && pages.length === 0;
  const showEmpty = status === 'ready' && pages.length === 0;
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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Footer</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isRefreshing && pages.length > 0 && 'opacity-60')}>
            {showSkeleton ? <SkeletonRows /> : null}

            {showErrorState ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <TriangleAlertIcon className="size-8 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Could not load pages</p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadPages()}
                    >
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showEmpty ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
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
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {pages.map((page) => (
              <TableRow key={page.id}>
                <TableCell
                  className="max-w-[22rem] truncate font-medium text-foreground"
                  title={page.title}
                >
                  {page.title}
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {page.id}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[page.status]}>{STATUS_LABEL[page.status]}</Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    'tabular-nums',
                    page.showInFooter ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {page.showInFooter ? 'Yes' : 'No'}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatUpdatedDate(page.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon-sm">
                      <a
                        href={`/dashboard/pages/${encodeURIComponent(page.id)}/edit`}
                        aria-label={`Edit ${page.title}`}
                      >
                        <PencilIcon />
                      </a>
                    </Button>
                    {page.status === 'published' ? (
                      <Button asChild variant="ghost" size="icon-sm">
                        <a
                          href={`/${page.id}/`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${page.title}`}
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
                        aria-label={`${page.title} is not published yet`}
                      >
                        <ExternalLinkIcon />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={isDeleting}
                      aria-label={`Delete ${page.title}`}
                      onClick={() => setDeleteTarget(page)}
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
