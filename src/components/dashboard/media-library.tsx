import {
  CopyIcon,
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

export const MEDIA_ENDPOINT = '/api/dashboard/media';
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';
export const MEDIA_ALT_MAX_LENGTH = 200;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
const UNSUPPORTED_TYPE_MESSAGE = 'Only JPEG, PNG, GIF, WebP, or AVIF images are allowed.';
const FILE_TOO_LARGE_MESSAGE = 'Images must be 5 MB or smaller.';
const SKELETON_CARDS = [
  'media-skeleton-1',
  'media-skeleton-2',
  'media-skeleton-3',
  'media-skeleton-4',
  'media-skeleton-5',
  'media-skeleton-6',
  'media-skeleton-7',
  'media-skeleton-8',
];

export interface MediaItem {
  id: string;
  path: string;
  url: string;
  alt: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

interface PendingUpload {
  key: string;
  name: string;
}

export function validateMediaFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return UNSUPPORTED_TYPE_MESSAGE;
  }

  if (file.size > MAX_BYTES) {
    return FILE_TOO_LARGE_MESSAGE;
  }

  return null;
}

export async function uploadMediaFile(file: File, signal: AbortSignal): Promise<MediaItem> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await requestJson<{ media: MediaItem }>(MEDIA_ENDPOINT, {
    method: 'POST',
    body: formData,
    signal,
  });

  return payload.media;
}

export function formatKilobytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

export function shortMediaId(id: string): string {
  return id.slice(0, 8);
}

export function toAbsoluteMediaUrl(url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  return `${window.location.origin}${url}`;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function toggleId(ids: ReadonlySet<string>, id: string, isPresent: boolean): ReadonlySet<string> {
  const next = new Set(ids);
  if (isPresent) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

interface MediaCardProps {
  item: MediaItem;
  isSavingAlt: boolean;
  onSaveAlt: (item: MediaItem, alt: string) => void;
  onCopyUrl: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

function MediaCard({ item, isSavingAlt, onSaveAlt, onCopyUrl, onDelete }: MediaCardProps) {
  const [alt, setAlt] = useState(item.alt);

  useEffect(() => {
    setAlt(item.alt);
  }, [item.alt]);

  const commitAlt = () => {
    const nextAlt = alt.trim();
    if (isSavingAlt || nextAlt === item.alt) {
      return;
    }
    onSaveAlt(item, nextAlt);
  };

  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        <img
          src={item.url}
          alt={item.alt}
          width={400}
          height={300}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-mono" title={item.id}>
          {shortMediaId(item.id)}
        </span>
        <span className="shrink-0 tabular-nums">{formatKilobytes(item.bytes)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`media-alt-${item.id}`} className="text-xs text-muted-foreground">
            Alt text
          </Label>
          {isSavingAlt ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
              Saving
            </span>
          ) : null}
        </div>
        <Input
          id={`media-alt-${item.id}`}
          value={alt}
          maxLength={MEDIA_ALT_MAX_LENGTH}
          disabled={isSavingAlt}
          autoComplete="off"
          placeholder="Describe this image"
          onChange={(event) => setAlt(event.target.value)}
          onBlur={commitAlt}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitAlt();
            } else if (event.key === 'Escape') {
              setAlt(item.alt);
            }
          }}
        />
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 whitespace-nowrap"
          onClick={() => onCopyUrl(item)}
        >
          <CopyIcon />
          Copy URL
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="whitespace-nowrap text-destructive hover:text-destructive"
          onClick={() => onDelete(item)}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </article>
  );
}

interface DeleteMediaDialogProps {
  item: MediaItem | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}

function DeleteMediaDialog({
  item,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: DeleteMediaDialogProps) {
  return (
    <DialogPrimitive.Root
      open={item !== null}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Delete image
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {item
              ? `Delete image ${shortMediaId(item.id)}? This cannot be undone.`
              : 'Confirm the removal of this image.'}
          </DialogPrimitive.Description>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            className="whitespace-nowrap"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            className="whitespace-nowrap"
            onClick={onConfirm}
          >
            {isDeleting ? 'Deleting' : 'Delete image'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingAltIds, setSavingAltIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const altAbortRef = useRef(new Map<string, AbortController>());
  const latestRequestRef = useRef(0);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = pendingUploads.length > 0;
  const isUploadDisabled = isUploading || status === 'loading';

  const loadMedia = useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<{ media: MediaItem[] }>(MEDIA_ENDPOINT, {
        signal: controller.signal,
      });
      if (latestRequestRef.current !== requestId) {
        return;
      }
      setItems(payload.media);
      setStatus('ready');
    } catch (error) {
      if (latestRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadMedia();
    return () => listAbortRef.current?.abort();
  }, [loadMedia]);

  useEffect(() => {
    const altControllers = altAbortRef.current;
    return () => {
      listAbortRef.current?.abort();
      uploadAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
      for (const controller of altControllers.values()) {
        controller.abort();
      }
    };
  }, []);

  const handleUploadFiles = async (files: File[]) => {
    if (isUploadDisabled) {
      return;
    }

    const acceptedFiles: File[] = [];
    for (const file of files) {
      const reason = validateMediaFile(file);
      if (reason) {
        toast.error(`Skipped ${file.name}. ${reason}`);
      } else {
        acceptedFiles.push(file);
      }
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    const queued = acceptedFiles.map((file) => ({ key: crypto.randomUUID(), file }));
    setPendingUploads(queued.map((entry) => ({ key: entry.key, name: entry.file.name })));

    for (const entry of queued) {
      try {
        const uploaded = await uploadMediaFile(entry.file, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setItems((current) => [uploaded, ...current]);
        setStatus('ready');
        toast.success(`Uploaded ${entry.file.name}.`);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        toast.error(`${entry.file.name}: ${toErrorMessage(error)}`);
      } finally {
        if (!controller.signal.aborted) {
          setPendingUploads((current) => current.filter((pending) => pending.key !== entry.key));
        }
      }
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void handleUploadFiles(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploadDisabled) {
      return;
    }
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (isUploadDisabled) {
      return;
    }
    void handleUploadFiles(Array.from(event.dataTransfer.files));
  };

  const handleSaveAlt = async (item: MediaItem, alt: string) => {
    altAbortRef.current.get(item.id)?.abort();
    const controller = new AbortController();
    altAbortRef.current.set(item.id, controller);
    setSavingAltIds((current) => toggleId(current, item.id, true));

    try {
      const payload = await requestJson<{ media: MediaItem }>(
        `${MEDIA_ENDPOINT}/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ alt }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      setItems((current) =>
        current.map((entry) => (entry.id === payload.media.id ? payload.media : entry)),
      );
      toast.success('Alt text saved.');
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (altAbortRef.current.get(item.id) === controller) {
        altAbortRef.current.delete(item.id);
      }
      if (!controller.signal.aborted) {
        setSavingAltIds((current) => toggleId(current, item.id, false));
      }
    }
  };

  const handleCopyUrl = async (item: MediaItem) => {
    const didCopy = await copyText(toAbsoluteMediaUrl(item.url));
    if (didCopy) {
      toast.success('Copied the image URL.');
    } else {
      toast.error('The URL could not be copied. Open the image to copy its address instead.');
    }
  };

  const handleDeleteConfirm = async () => {
    const target = itemToDelete;
    if (!target || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${MEDIA_ENDPOINT}/${encodeURIComponent(target.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== target.id));
      toast.success(`Deleted image ${shortMediaId(target.id)}.`);
      setItemToDelete(null);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      const message = toErrorMessage(error);
      setDeleteError(message);
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsDeleting(false);
      }
    }
  };

  const showSkeleton = status === 'loading';
  const showErrorState = status === 'error' && items.length === 0;
  const showEmptyState = status === 'ready' && items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Media library
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {status === 'ready' ? (
              <>
                <span className="tabular-nums">{items.length}</span>{' '}
                {items.length === 1 ? 'image' : 'images'}. JPEG, PNG, GIF, WebP, or AVIF, up to 5 MB
                each. Drag and drop files onto the grid to upload.
              </>
            ) : (
              'JPEG, PNG, GIF, WebP, or AVIF, up to 5 MB each. Drag and drop files onto the grid to upload.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={handleFileInputChange}
          />
          <Button
            type="button"
            className="whitespace-nowrap"
            disabled={isUploadDisabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            {isUploading ? 'Uploading' : 'Upload image'}
          </Button>
        </div>
      </div>

      {pendingUploads.length > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2"
        >
          {pendingUploads.map((entry) => (
            <p key={entry.key} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              <span className="min-w-0 truncate">Uploading {entry.name}</span>
            </p>
          ))}
        </div>
      ) : null}

      <section
        aria-label="Media grid"
        className={cn(
          'relative rounded-xl',
          isDragActive && 'ring-2 ring-ring/50 ring-offset-2 ring-offset-background',
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showSkeleton ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading the media library</span>
            <ul
              aria-hidden="true"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            >
              {SKELETON_CARDS.map((cardKey) => (
                <li
                  key={cardKey}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <Skeleton className="aspect-[4/3] w-full" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-8 w-full" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showErrorState ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
            <TriangleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Could not load the media library
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadMedia()}>
              <RefreshCwIcon />
              Retry
            </Button>
          </div>
        ) : null}

        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <InboxIcon className="size-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">No images yet</p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                Use the Upload image button above, or drop files here. Then pick one as a cover in
                the post editor.
              </p>
            </div>
          </div>
        ) : null}

        {!showSkeleton && !showErrorState && !showEmptyState ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <MediaCard
                  item={item}
                  isSavingAlt={savingAltIds.has(item.id)}
                  onSaveAlt={(target, alt) => void handleSaveAlt(target, alt)}
                  onCopyUrl={(target) => void handleCopyUrl(target)}
                  onDelete={(target) => {
                    setDeleteError(null);
                    setItemToDelete(target);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-background/85">
            <p className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs">
              <UploadIcon className="size-4" aria-hidden="true" />
              Drop images to upload
            </p>
          </div>
        ) : null}
      </section>

      <DeleteMediaDialog
        item={itemToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setItemToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}
