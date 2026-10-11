import {
  CopyIcon,
  ImagePlusIcon,
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  WandSparklesIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import MediaFinder from './media-finder';

export const MEDIA_ENDPOINT = '/api/dashboard/media';
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';
export const MEDIA_ALT_MAX_LENGTH = 200;
export const IMAGE_MODEL_UNAVAILABLE_CODE = 'IMAGE_MODEL_UNAVAILABLE';

const GENERATE_ENDPOINT = `${MEDIA_ENDPOINT}/generate`;
const SEARCH_ENDPOINT = `${MEDIA_ENDPOINT}/search`;
const IMPORT_ENDPOINT = `${MEDIA_ENDPOINT}/import`;
const AUTO_COVER_ENDPOINT = `${MEDIA_ENDPOINT}/auto-cover`;
const REGENERATE_ENDPOINT = `${MEDIA_ENDPOINT}/regenerate`;

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
  source?: 'upload' | 'generated' | 'search' | null;
  sourceUrl?: string | null;
  creator?: string | null;
  creatorUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  prompt?: string | null;
}

export type MediaSource = 'upload' | 'generated' | 'search';

export interface MediaSearchResult {
  id: string;
  title: string | null;
  thumbnailUrl: string;
  imageUrl: string;
  creator: string | null;
  creatorUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

export interface MediaSearchResponse {
  results: MediaSearchResult[];
  total: number;
  page: number;
}

export interface AutoCoverResponse {
  media: MediaItem;
  post: { id: string; title: string };
  remaining: number;
}

export interface GenerateMediaInput {
  prompt: string;
  alt?: string;
  attachToPostId?: string;
}

export interface ImportMediaInput {
  imageUrl: string;
  title?: string;
  alt?: string;
  creator?: string;
  creatorUrl?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  attachToPostId?: string;
}

const SOURCE_LABELS: Record<MediaSource, string> = {
  upload: 'Upload',
  generated: 'Generated',
  search: 'Search',
};

export function mediaSourceLabel(source: MediaItem['source']): string {
  return source ? SOURCE_LABELS[source] : SOURCE_LABELS.upload;
}

export async function generateMedia(
  input: GenerateMediaInput,
  signal: AbortSignal,
): Promise<MediaItem> {
  const payload = await requestJson<{ media: MediaItem }>(GENERATE_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });

  return payload.media;
}

export async function searchMedia(
  query: string,
  page: number,
  signal: AbortSignal,
): Promise<MediaSearchResponse> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  return requestJson<MediaSearchResponse>(`${SEARCH_ENDPOINT}?${params.toString()}`, { signal });
}

export async function importMedia(
  input: ImportMediaInput,
  signal: AbortSignal,
): Promise<MediaItem> {
  const payload = await requestJson<{ media: MediaItem }>(IMPORT_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });

  return payload.media;
}

export async function autoCoverPost(signal: AbortSignal): Promise<AutoCoverResponse> {
  return requestJson<AutoCoverResponse>(AUTO_COVER_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export async function deleteMediaItem(id: string, signal: AbortSignal): Promise<void> {
  await requestJson<{ id: string; deleted: boolean }>(
    `${MEDIA_ENDPOINT}/${encodeURIComponent(id)}`,
    { method: 'DELETE', signal },
  );
}

export async function regenerateMedia(id: string, signal: AbortSignal): Promise<MediaItem> {
  const payload = await requestJson<{ media: MediaItem }>(REGENERATE_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ id }),
    signal,
  });

  return payload.media;
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
  isRegenerating: boolean;
  isRegenerateLocked: boolean;
  onSaveAlt: (item: MediaItem, alt: string) => void;
  onCopyUrl: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onRegenerate: (item: MediaItem) => void;
}

function MediaCard({
  item,
  isSavingAlt,
  isRegenerating,
  isRegenerateLocked,
  onSaveAlt,
  onCopyUrl,
  onDelete,
  onRegenerate,
}: MediaCardProps) {
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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge
          variant="outline"
          className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {mediaSourceLabel(item.source)}
        </Badge>
        {item.source === 'search' && item.creator ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {item.creatorUrl ? (
              <a
                href={item.creatorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {item.creator}
              </a>
            ) : (
              item.creator
            )}
          </span>
        ) : null}
        {item.source === 'search' && item.license ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {item.licenseUrl ? (
              <a
                href={item.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {item.license}
              </a>
            ) : (
              item.license
            )}
          </span>
        ) : null}
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

      <div className="mt-auto flex flex-col gap-2">
        {item.source === 'generated' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full whitespace-nowrap"
            disabled={isRegenerateLocked}
            onClick={() => onRegenerate(item)}
            title="Generate a fresh version of this image and swap it in everywhere it is used"
          >
            {isRegenerating ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            {isRegenerating ? 'Regenerating' : 'Regenerate'}
          </Button>
        ) : null}
        <div className="flex items-center gap-2">
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
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [autoCoverStatus, setAutoCoverStatus] = useState<
    'idle' | 'running' | 'stopped' | 'done' | 'error'
  >('idle');
  const [autoCoverDone, setAutoCoverDone] = useState(0);
  const [autoCoverTotal, setAutoCoverTotal] = useState<number | null>(null);
  const [autoCoverTitle, setAutoCoverTitle] = useState<string | null>(null);
  const [autoCoverError, setAutoCoverError] = useState<string | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const regenerateAbortRef = useRef<AbortController | null>(null);
  const autoCoverAbortRef = useRef<AbortController | null>(null);
  const isAutoCoverActiveRef = useRef(false);
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
      regenerateAbortRef.current?.abort();
      autoCoverAbortRef.current?.abort();
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

  const handleRegenerate = async (item: MediaItem) => {
    if (regeneratingId) {
      return;
    }

    regenerateAbortRef.current?.abort();
    const controller = new AbortController();
    regenerateAbortRef.current = controller;
    setRegeneratingId(item.id);

    try {
      const media = await regenerateMedia(item.id, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setItems((current) => [media, ...current.filter((entry) => entry.id !== item.id)]);
      toast.success('Generated a fresh version and swapped it in everywhere it was used.');
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        toast.error(toErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setRegeneratingId(null);
      }
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
      await deleteMediaItem(target.id, controller.signal);
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

  const handleStartAutoCover = async () => {
    if (isAutoCoverActiveRef.current) {
      return;
    }

    isAutoCoverActiveRef.current = true;
    autoCoverAbortRef.current?.abort();
    const controller = new AbortController();
    autoCoverAbortRef.current = controller;

    setAutoCoverStatus('running');
    setAutoCoverDone(0);
    setAutoCoverTotal(null);
    setAutoCoverTitle(null);
    setAutoCoverError(null);

    let processed = 0;
    try {
      for (;;) {
        const payload = await autoCoverPost(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        processed += 1;
        setAutoCoverDone(processed);
        setAutoCoverTotal(processed + payload.remaining);
        setAutoCoverTitle(payload.post.title);
        setItems((current) => [payload.media, ...current]);
        setStatus('ready');
        if (payload.remaining <= 0) {
          setAutoCoverStatus('done');
          break;
        }
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setAutoCoverError(toErrorMessage(error));
      setAutoCoverStatus(processed > 0 ? 'stopped' : 'error');
    } finally {
      isAutoCoverActiveRef.current = false;
      if (autoCoverAbortRef.current === controller) {
        autoCoverAbortRef.current = null;
      }
    }
  };

  const handleStopAutoCover = () => {
    autoCoverAbortRef.current?.abort();
    setAutoCoverStatus('stopped');
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
            variant="outline"
            className="whitespace-nowrap"
            onClick={() => setIsFinderOpen(true)}
          >
            <ImagePlusIcon />
            Find images
          </Button>
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap"
            disabled={autoCoverStatus === 'running'}
            onClick={() => void handleStartAutoCover()}
          >
            {autoCoverStatus === 'running' ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <WandSparklesIcon />
            )}
            Auto-cover posts
          </Button>
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

      {autoCoverStatus !== 'idle' ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          {autoCoverStatus === 'running' ? (
            <>
              <div className="flex items-center gap-2">
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                <p className="min-w-0 text-sm tabular-nums text-foreground">
                  Generating cover <span>{autoCoverDone + 1}</span>
                  {autoCoverTotal ? ` of ${autoCoverTotal}` : ''}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto whitespace-nowrap"
                  onClick={handleStopAutoCover}
                >
                  <SquareIcon className="fill-current" />
                  Stop
                </Button>
              </div>
              <p
                className="min-w-0 truncate text-xs text-muted-foreground"
                title={autoCoverTitle ?? undefined}
              >
                {autoCoverTitle ?? 'Choosing the next post to cover.'}
              </p>
            </>
          ) : null}

          {autoCoverStatus === 'done' ? (
            <p className="text-sm text-foreground">
              <span className="tabular-nums">{autoCoverDone}</span>{' '}
              {autoCoverDone === 1 ? 'cover' : 'covers'} generated. Every post that needed one has
              one.
            </p>
          ) : null}

          {autoCoverStatus === 'stopped' ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-foreground">
                Stopped after <span className="tabular-nums">{autoCoverDone}</span>{' '}
                {autoCoverDone === 1 ? 'cover' : 'covers'}. The covers already generated are saved.
              </p>
              {autoCoverError ? <p className="text-sm text-destructive">{autoCoverError}</p> : null}
            </div>
          ) : null}

          {autoCoverStatus === 'error' ? (
            <p className="text-sm text-destructive">{autoCoverError}</p>
          ) : null}
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
                  isRegenerating={regeneratingId === item.id}
                  isRegenerateLocked={regeneratingId !== null}
                  onSaveAlt={(target, alt) => void handleSaveAlt(target, alt)}
                  onCopyUrl={(target) => void handleCopyUrl(target)}
                  onRegenerate={(target) => void handleRegenerate(target)}
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

      <MediaFinder
        open={isFinderOpen}
        onOpenChange={(nextOpen) => {
          setIsFinderOpen(nextOpen);
          if (!nextOpen) {
            void loadMedia();
          }
        }}
      />
    </div>
  );
}
