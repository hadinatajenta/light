import {
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import {
  formatKilobytes,
  isAbortError,
  MEDIA_ACCEPT,
  MEDIA_ENDPOINT,
  type MediaItem,
  shortMediaId,
  toAbsoluteMediaUrl,
  uploadMediaFile,
  validateMediaFile,
} from './media-library';

const PICKER_SKELETON_TILES = [
  'picker-skeleton-1',
  'picker-skeleton-2',
  'picker-skeleton-3',
  'picker-skeleton-4',
  'picker-skeleton-5',
  'picker-skeleton-6',
];

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, alt: string) => void;
}

export default function MediaPicker({ open, onOpenChange, onSelect }: MediaPickerProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const latestRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!open) {
      return;
    }
    setQuery('');
    void loadMedia();
    return () => listAbortRef.current?.abort();
  }, [open, loadMedia]);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      uploadAbortRef.current?.abort();
    };
  }, []);

  const handleUpload = async (file: File) => {
    if (isUploadDisabled) {
      return;
    }

    const reason = validateMediaFile(file);
    if (reason) {
      toast.error(`Skipped ${file.name}. ${reason}`);
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setIsUploading(true);

    try {
      const uploaded = await uploadMediaFile(file, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setItems((current) => [uploaded, ...current]);
      setStatus('ready');
      toast.success(`Uploaded ${file.name}.`);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsUploading(false);
      }
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void handleUpload(file);
    }
  };

  const handleSelect = (item: MediaItem) => {
    onSelect(toAbsoluteMediaUrl(item.url), item.alt);
    onOpenChange(false);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter(
        (item) =>
          item.alt.toLowerCase().includes(normalizedQuery) ||
          item.id.toLowerCase().includes(normalizedQuery),
      )
    : items;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isUploading) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="flex max-h-[85dvh] max-w-3xl flex-col">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Choose a cover image
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Pick an image to fill the cover URL and alt text. Both fields stay editable afterwards.
          </DialogPrimitive.Description>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-picker-search">Search</Label>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="media-picker-search"
                type="search"
                className="pl-9"
                placeholder="Search by alt text or id"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={handleFileInputChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              disabled={isUploadDisabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              {isUploading ? 'Uploading' : 'Upload'}
            </Button>
          </div>
          {normalizedQuery && status === 'ready' ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {visibleItems.length} of {items.length} {items.length === 1 ? 'image' : 'images'}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {status === 'loading' ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">Loading the media library</span>
              <ul aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PICKER_SKELETON_TILES.map((tileKey) => (
                  <li
                    key={tileKey}
                    className="flex flex-col gap-2 rounded-lg border border-border p-2"
                  >
                    <Skeleton className="aspect-[4/3] w-full" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
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

          {status === 'ready' && items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No images yet. Upload one to use it as a cover.
            </p>
          ) : null}

          {status === 'ready' && items.length > 0 && visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No images match your search.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            </div>
          ) : null}

          {status === 'ready' && visibleItems.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleItems.map((item) => (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    className={cn(
                      'flex h-full w-full min-w-0 flex-col gap-2 rounded-lg border border-border p-2 text-left',
                      'hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    )}
                    aria-label={`Use image ${shortMediaId(item.id)}${item.alt ? `: ${item.alt}` : ''}`}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                      <img
                        src={item.url}
                        alt=""
                        width={400}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-mono" title={item.id}>
                        {shortMediaId(item.id)}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatKilobytes(item.bytes)}</span>
                    </span>
                    <span
                      className={cn(
                        'line-clamp-2 text-xs',
                        item.alt ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {item.alt || 'No alt text'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}
