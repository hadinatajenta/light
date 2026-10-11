import {
  CheckIcon,
  DownloadIcon,
  InboxIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ApiRequestError, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import {
  deleteMediaItem,
  formatKilobytes,
  generateMedia,
  IMAGE_MODEL_UNAVAILABLE_CODE,
  type ImportMediaInput,
  importMedia,
  isAbortError,
  type MediaItem,
  type MediaSearchResult,
  searchMedia,
} from './media-library';

const GENERATE_TEXTAREA_CLASS =
  'min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

const SEARCH_SKELETON_TILES = [
  'media-search-skeleton-1',
  'media-search-skeleton-2',
  'media-search-skeleton-3',
  'media-search-skeleton-4',
  'media-search-skeleton-5',
  'media-search-skeleton-6',
];

const FINDER_TABS = [
  { id: 'generate', label: 'Generate' },
  { id: 'search', label: 'Search' },
] as const;

type FinderTab = (typeof FINDER_TABS)[number]['id'];
type AsyncStatus = 'idle' | 'loading' | 'error' | 'ready';

const BATCH_COUNT_OPTIONS = [3, 5, 10] as const;

type BatchCount = (typeof BATCH_COUNT_OPTIONS)[number];

const DEFAULT_BATCH_COUNT: BatchCount = 5;

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

type ResultImportState =
  | { status: 'importing' }
  | { status: 'imported' }
  | { status: 'failed'; reason: string };

interface BatchProgress {
  current: number;
  total: number;
  activeResultId: string | null;
}

interface BatchSequenceResult {
  imported: number;
  failed: number;
  total: number;
}

interface BatchSummary extends BatchSequenceResult {
  matched: number;
}

function withResultState(
  states: Record<string, ResultImportState>,
  resultId: string,
  state: ResultImportState,
): Record<string, ResultImportState> {
  return { ...states, [resultId]: state };
}

function resultStateLabel(state: ResultImportState): string {
  if (state.status === 'importing') {
    return 'Importing';
  }
  if (state.status === 'imported') {
    return 'In library';
  }
  return 'Failed';
}

function buildResultAccessibilityLabel(
  result: MediaSearchResult,
  state: ResultImportState | undefined,
): string {
  const label = result.title ? `Select ${result.title}` : 'Select this image';
  if (!state) {
    return label;
  }
  if (state.status === 'failed') {
    return `${label}. Failed: ${state.reason}`;
  }
  return `${label}. ${resultStateLabel(state)}`;
}

function ImportStateIcon({ state }: { state: ResultImportState }) {
  if (state.status === 'importing') {
    return <Loader2Icon className="mt-0.5 size-3 shrink-0 animate-spin" aria-hidden="true" />;
  }
  if (state.status === 'imported') {
    return <CheckIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />;
  }
  return <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />;
}

function toImportMediaInput(result: MediaSearchResult): ImportMediaInput {
  const input: ImportMediaInput = { imageUrl: result.imageUrl };
  if (result.thumbnailUrl && result.thumbnailUrl !== result.imageUrl) {
    input.fallbackImageUrl = result.thumbnailUrl;
  }
  if (result.title) {
    input.title = result.title;
  }
  if (result.creator) {
    input.creator = result.creator;
  }
  if (result.creatorUrl) {
    input.creatorUrl = result.creatorUrl;
  }
  if (result.license) {
    input.license = result.license;
  }
  if (result.licenseUrl) {
    input.licenseUrl = result.licenseUrl;
  }
  if (result.sourceUrl) {
    input.sourceUrl = result.sourceUrl;
  }
  return input;
}

async function importResultsInSequence(
  resultsToImport: MediaSearchResult[],
  signal: AbortSignal,
  onResultStateChange: (resultId: string, state: ResultImportState) => void,
  onProgressChange: (progress: BatchProgress) => void,
): Promise<BatchSequenceResult | null> {
  let importedCount = 0;
  let failedCount = 0;
  const total = resultsToImport.length;

  for (const [index, result] of resultsToImport.entries()) {
    if (signal.aborted) {
      return null;
    }

    onProgressChange({ current: index + 1, total, activeResultId: result.id });
    onResultStateChange(result.id, { status: 'importing' });

    try {
      await importMedia(toImportMediaInput(result), signal);
      if (signal.aborted) {
        return null;
      }
      importedCount += 1;
      onResultStateChange(result.id, { status: 'imported' });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        return null;
      }
      failedCount += 1;
      onResultStateChange(result.id, { status: 'failed', reason: toErrorMessage(error) });
    }
  }

  return { imported: importedCount, failed: failedCount, total };
}

function reportBatchOutcome(outcome: BatchSummary): void {
  if (outcome.matched === 0) {
    toast.info('No images match that search.');
    return;
  }
  if (outcome.total === 0) {
    toast.info('Every matching image is already in the library.');
    return;
  }
  if (outcome.failed === 0) {
    toast.success(`Imported ${outcome.imported} of ${outcome.total} images.`);
    return;
  }
  if (outcome.imported === 0) {
    toast.error(`Could not import any of the ${outcome.total} images.`);
    return;
  }
  toast.warning(`Imported ${outcome.imported} of ${outcome.total}, ${outcome.failed} failed.`);
}

interface MediaFinderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (media: MediaItem) => void;
  defaultPrompt?: string;
  defaultQuery?: string;
}

function generateErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === IMAGE_MODEL_UNAVAILABLE_CODE) {
    return 'Image generation is not available on this site yet. You can still search Creative Commons images in the Search tab.';
  }
  return toErrorMessage(error);
}

function isEmptyOrWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

interface GeneratePanelProps {
  prompt: string;
  status: AsyncStatus;
  error: string | null;
  media: MediaItem | null;
  addLabel: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onAdd: () => void;
}

function GeneratePanel({
  prompt,
  status,
  error,
  media,
  addLabel,
  onPromptChange,
  onGenerate,
  onAdd,
}: GeneratePanelProps) {
  const isGenerating = status === 'loading';
  const isBusy = isGenerating;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {isGenerating
          ? 'Generating the image'
          : status === 'ready' && media
            ? 'The generated image is ready'
            : ''}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="media-generate-prompt">Prompt</Label>
        <textarea
          id="media-generate-prompt"
          rows={3}
          className={GENERATE_TEXTAREA_CLASS}
          value={prompt}
          disabled={isBusy}
          placeholder="Describe the image: subject, setting, style, and mood."
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Generation takes a few seconds. Keep this tab open while it runs.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="whitespace-nowrap"
          disabled={isBusy || isEmptyOrWhitespace(prompt)}
          onClick={onGenerate}
        >
          {isGenerating ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {isGenerating ? 'Generating' : 'Generate'}
        </Button>
      </div>

      {isGenerating ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-[4/3] w-full max-w-md rounded-xl" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : null}

      {status === 'error' && error ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Image not generated</p>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={onGenerate}
          >
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {status === 'ready' && media ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-border bg-muted">
            <img
              src={media.url}
              alt={media.alt || 'Generated image'}
              width={800}
              height={600}
              className="max-h-[22rem] w-full object-contain"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Result size: <span className="tabular-nums">{formatKilobytes(media.bytes)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="whitespace-nowrap"
              disabled={isBusy}
              onClick={onGenerate}
            >
              <RefreshCwIcon />
              Try again
            </Button>
            <Button type="button" className="whitespace-nowrap" disabled={isBusy} onClick={onAdd}>
              <CheckIcon />
              {addLabel}
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'idle' ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Write a prompt and generate an image. It is saved to the library with the rest of your
          media.
        </p>
      ) : null}
    </div>
  );
}

interface SearchPanelProps {
  query: string;
  status: AsyncStatus;
  error: string | null;
  results: MediaSearchResult[];
  selectedResultId: string | null;
  resultStates: Record<string, ResultImportState>;
  batchCount: BatchCount;
  batchProgress: BatchProgress | null;
  batchSummary: BatchSummary | null;
  isImporting: boolean;
  isBatchImporting: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelectResult: (id: string) => void;
  onImport: (result: MediaSearchResult) => void;
  onBatchCountChange: (value: string) => void;
  onRequestBatchImport: () => void;
}

function CreditLink({ value, href, label }: { value: string; href: string | null; label: string }) {
  if (!href) {
    return <span className="text-foreground">{value}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-4 hover:text-foreground/80"
    >
      {value}
      <span className="sr-only"> ({label})</span>
    </a>
  );
}

function SearchPanel({
  query,
  status,
  error,
  results,
  selectedResultId,
  resultStates,
  batchCount,
  batchProgress,
  batchSummary,
  isImporting,
  isBatchImporting,
  onQueryChange,
  onSearch,
  onSelectResult,
  onImport,
  onBatchCountChange,
  onRequestBatchImport,
}: SearchPanelProps) {
  const isSearching = status === 'loading';
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;
  const selectedResultState = selectedResult ? resultStates[selectedResult.id] : undefined;
  const selectedImportError =
    selectedResultState?.status === 'failed' ? selectedResultState.reason : null;
  const activeBatchResult = batchProgress?.activeResultId
    ? (results.find((result) => result.id === batchProgress.activeResultId) ?? null)
    : null;
  const isImportBusy = isImporting || isBatchImporting;
  const batchProgressLabel =
    batchProgress && batchProgress.current > 0
      ? `Importing ${batchProgress.current} of ${batchProgress.total}`
      : null;
  const batchSummaryLabel = batchSummary
    ? batchSummary.matched === 0
      ? 'No images match that search.'
      : batchSummary.total === 0
        ? 'Every matching image is already in the library.'
        : `Imported ${batchSummary.imported} of ${batchSummary.total}${batchSummary.failed > 0 ? `, ${batchSummary.failed} failed` : ''}.`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <Label htmlFor="media-search-query">Search</Label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="media-search-query"
              type="search"
              className="pl-9"
              value={query}
              placeholder="Describe what you need: topic, scene, or object"
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="whitespace-nowrap"
            disabled={isSearching || isBatchImporting}
          >
            {isSearching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
            {isSearching ? 'Searching' : 'Search'}
          </Button>
          <div className="flex items-center gap-2">
            <Label htmlFor="media-search-batch-count" className="sr-only">
              Images per batch import
            </Label>
            <select
              id="media-search-batch-count"
              className={SELECT_CLASS}
              value={String(batchCount)}
              disabled={isBatchImporting}
              onChange={(event) => onBatchCountChange(event.target.value)}
            >
              {BATCH_COUNT_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option}
                </option>
              ))}
            </select>
            <Button
              type="button"
              className="whitespace-nowrap"
              disabled={isImportBusy}
              onClick={onRequestBatchImport}
            >
              {isBatchImporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
              {isBatchImporting
                ? (batchProgressLabel ?? 'Preparing import')
                : `Auto import ${batchCount}`}
            </Button>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          These images are Creative Commons. The creator and licence are saved with the image as its
          credit.
        </p>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {isSearching
          ? 'Searching for images'
          : status === 'ready'
            ? `${results.length} ${results.length === 1 ? 'image' : 'images'} found`
            : ''}
      </p>

      {isBatchImporting && batchProgressLabel ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2"
        >
          <p className="flex items-center gap-2 text-sm text-foreground tabular-nums">
            <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            {batchProgressLabel}
          </p>
          {activeBatchResult ? (
            <p
              className="min-w-0 truncate text-xs text-muted-foreground"
              title={activeBatchResult.title ?? undefined}
            >
              {activeBatchResult.title || 'Untitled image'}
            </p>
          ) : null}
        </div>
      ) : null}

      {batchSummaryLabel ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-card px-3 py-2"
        >
          <p className="text-sm text-foreground tabular-nums">{batchSummaryLabel}</p>
        </div>
      ) : null}

      {isSearching ? (
        <ul aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SEARCH_SKELETON_TILES.map((tileKey) => (
            <li key={tileKey} className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-3 w-24" />
            </li>
          ))}
        </ul>
      ) : null}

      {status === 'error' && error ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Search failed</p>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={onSearch}
          >
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {status === 'idle' ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Search a topic to find a Creative Commons image, then add it with its credit.
        </p>
      ) : null}

      {status === 'ready' && results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <InboxIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No images match that search.</p>
          <p className="max-w-prose text-xs text-muted-foreground">
            Try a broader or more concrete keyword.
          </p>
        </div>
      ) : null}

      {status === 'ready' && results.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((result) => {
              const isSelected = result.id === selectedResultId;
              const resultState = resultStates[result.id];
              return (
                <li key={result.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={buildResultAccessibilityLabel(result, resultState)}
                    onClick={() => onSelectResult(result.id)}
                    className={cn(
                      'flex h-full w-full min-w-0 flex-col gap-2 rounded-lg border p-2 text-left',
                      'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      isSelected
                        ? 'border-primary ring-1 ring-primary/30'
                        : 'border-border hover:border-ring',
                    )}
                  >
                    <span className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                      <img
                        src={result.thumbnailUrl || result.imageUrl}
                        alt=""
                        width={400}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="line-clamp-2 text-xs text-foreground">
                      {result.title || 'Untitled image'}
                    </span>
                    {result.creator ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.creator}
                      </span>
                    ) : null}
                    {resultState ? (
                      <span
                        className={cn(
                          'flex items-start gap-1 text-xs',
                          resultState.status === 'failed'
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        <ImportStateIcon state={resultState} />
                        <span className="line-clamp-2 min-w-0">
                          {resultState.status === 'failed'
                            ? `Failed: ${resultState.reason}`
                            : resultStateLabel(resultState)}
                        </span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <article className="flex h-fit flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:sticky lg:top-0">
            {selectedResult ? (
              <>
                <div className="overflow-hidden rounded-md bg-muted">
                  <img
                    src={selectedResult.imageUrl}
                    alt={selectedResult.title || 'Selected image'}
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium text-foreground">
                    {selectedResult.title || 'Untitled image'}
                  </h3>
                  {selectedResult.creator ? (
                    <p className="text-xs text-muted-foreground">
                      By{' '}
                      <CreditLink
                        value={selectedResult.creator}
                        href={selectedResult.creatorUrl}
                        label="opens the creator page"
                      />
                    </p>
                  ) : null}
                  {selectedResult.license ? (
                    <p className="text-xs text-muted-foreground">
                      Licence:{' '}
                      <CreditLink
                        value={selectedResult.license}
                        href={selectedResult.licenseUrl}
                        label="opens the licence"
                      />
                    </p>
                  ) : null}
                  {selectedResult.sourceUrl ? (
                    <p className="text-xs text-muted-foreground">
                      <a
                        href={selectedResult.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                      >
                        View the original
                      </a>
                    </p>
                  ) : null}
                </div>

                {selectedImportError ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {selectedImportError}
                  </p>
                ) : null}

                {selectedResultState && selectedResultState.status !== 'failed' ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImportStateIcon state={selectedResultState} />
                    {resultStateLabel(selectedResultState)}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="w-full whitespace-nowrap"
                  disabled={isImportBusy}
                  onClick={() => onImport(selectedResult)}
                >
                  {isImporting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                  {isImporting ? 'Adding' : 'Add to library'}
                </Button>
              </>
            ) : (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                Select a result to see its details and credit.
              </p>
            )}
          </article>
        </div>
      ) : null}
    </div>
  );
}

interface BatchImportDialogProps {
  open: boolean;
  query: string;
  plannedCount: number;
  isCountExact: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}

function BatchImportDialog({
  open,
  query,
  plannedCount,
  isCountExact,
  onOpenChange,
  onConfirm,
}: BatchImportDialogProps) {
  const hasNothingToImport = plannedCount === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Auto import images
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {hasNothingToImport
              ? `Every result for "${query}" is already in the library.`
              : isCountExact
                ? `This imports ${plannedCount} ${plannedCount === 1 ? 'image' : 'images'} for "${query}". Imports use your storage and cannot be undone in bulk.`
                : `This searches for "${query}", then imports up to ${plannedCount} images. Imports use your storage and cannot be undone in bulk.`}
          </DialogPrimitive.Description>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap"
            onClick={() => onOpenChange(false)}
          >
            {hasNothingToImport ? 'Close' : 'Cancel'}
          </Button>
          <Button
            type="button"
            className="whitespace-nowrap"
            disabled={hasNothingToImport}
            onClick={onConfirm}
          >
            {hasNothingToImport ? 'Nothing to import' : `Import ${plannedCount}`}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

export default function MediaFinder({
  open,
  onOpenChange,
  onSelect,
  defaultPrompt = '',
  defaultQuery = '',
}: MediaFinderProps) {
  const [activeTab, setActiveTab] = useState<FinderTab>('generate');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generateStatus, setGenerateStatus] = useState<AsyncStatus>('idle');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedMedia, setGeneratedMedia] = useState<MediaItem | null>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [searchStatus, setSearchStatus] = useState<AsyncStatus>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [resultStates, setResultStates] = useState<Record<string, ResultImportState>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [batchCount, setBatchCount] = useState<BatchCount>(DEFAULT_BATCH_COUNT);
  const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);

  const generateAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const generateRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const wasOpenRef = useRef(false);
  const tabRefs = useRef<Record<FinderTab, HTMLButtonElement | null>>({
    generate: null,
    search: null,
  });

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveTab('generate');
      setPrompt(defaultPrompt);
      setGenerateStatus('idle');
      setGenerateError(null);
      setGeneratedMedia(null);
      setQuery(defaultQuery);
      setSearchStatus('idle');
      setSearchError(null);
      setResults([]);
      setSearchedQuery(null);
      setSelectedResultId(null);
      setResultStates({});
      setIsImporting(false);
      setIsBatchConfirmOpen(false);
      setIsBatchImporting(false);
      setBatchProgress(null);
      setBatchSummary(null);
    }
    wasOpenRef.current = open;
  }, [open, defaultPrompt, defaultQuery]);

  useEffect(() => {
    if (activeTab !== 'generate') {
      generateAbortRef.current?.abort();
      generateRequestRef.current += 1;
      setGenerateStatus((current) => (current === 'loading' ? 'idle' : current));
    }
    if (activeTab !== 'search') {
      searchAbortRef.current?.abort();
      searchRequestRef.current += 1;
      setSearchStatus((current) => (current === 'loading' ? 'idle' : current));
    }
  }, [activeTab]);

  useEffect(() => {
    if (open) {
      return;
    }
    generateAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    importAbortRef.current?.abort();
    batchAbortRef.current?.abort();
    setIsBatchConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      importAbortRef.current?.abort();
      batchAbortRef.current?.abort();
    };
  }, []);

  const applySelectedMedia = useCallback(
    (media: MediaItem) => {
      if (!onSelect) {
        return false;
      }
      onSelect(media);
      onOpenChange(false);
      return true;
    },
    [onSelect, onOpenChange],
  );

  const discardGenerated = useCallback((media: MediaItem | null) => {
    if (!media) {
      return;
    }
    void deleteMediaItem(media.id, new AbortController().signal).catch(() => undefined);
  }, []);

  const runGenerate = useCallback(async () => {
    if (isEmptyOrWhitespace(prompt)) {
      setGenerateError('Enter a prompt that describes the image you want.');
      setGenerateStatus('error');
      return;
    }
    if (generateStatus === 'loading') {
      return;
    }

    discardGenerated(generatedMedia);

    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    const requestId = generateRequestRef.current + 1;
    generateRequestRef.current = requestId;

    setGenerateError(null);
    setGenerateStatus('loading');
    setGeneratedMedia(null);

    try {
      const media = await generateMedia({ prompt: prompt.trim() }, controller.signal);
      if (generateRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      setGeneratedMedia(media);
      setGenerateStatus('ready');
    } catch (error) {
      if (
        generateRequestRef.current !== requestId ||
        controller.signal.aborted ||
        isAbortError(error)
      ) {
        return;
      }
      const message = generateErrorMessage(error);
      setGenerateError(message);
      setGenerateStatus('error');
      toast.error(message);
    }
  }, [prompt, generateStatus, generatedMedia, discardGenerated]);

  const runAddGenerated = useCallback(() => {
    if (!generatedMedia) {
      return;
    }

    if (applySelectedMedia(generatedMedia)) {
      return;
    }

    toast.success('Saved to your media library.');
    onOpenChange(false);
  }, [generatedMedia, applySelectedMedia, onOpenChange]);

  const runSearch = useCallback(async () => {
    if (isBatchImporting) {
      return;
    }
    if (isEmptyOrWhitespace(query)) {
      setSearchError('Enter a keyword to search for images.');
      setSearchStatus('error');
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    setSearchStatus('loading');
    setSearchError(null);
    setResults([]);
    setSelectedResultId(null);

    try {
      const payload = await searchMedia(query.trim(), 1, controller.signal);
      if (searchRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      setResults(payload.results);
      setSearchedQuery(query.trim());
      setSelectedResultId(payload.results[0]?.id ?? null);
      setSearchStatus('ready');
    } catch (error) {
      if (
        searchRequestRef.current !== requestId ||
        controller.signal.aborted ||
        isAbortError(error)
      ) {
        return;
      }
      setSearchError(toErrorMessage(error));
      setSearchStatus('error');
    }
  }, [query, isBatchImporting]);

  const runImport = useCallback(
    async (result: MediaSearchResult) => {
      if (isImporting || isBatchImporting) {
        return;
      }

      importAbortRef.current?.abort();
      const controller = new AbortController();
      importAbortRef.current = controller;
      setIsImporting(true);
      setResultStates((current) => withResultState(current, result.id, { status: 'importing' }));

      try {
        const media = await importMedia(toImportMediaInput(result), controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setResultStates((current) => withResultState(current, result.id, { status: 'imported' }));
        toast.success('Added the image to the library with its credit.');
        applySelectedMedia(media);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        const message = toErrorMessage(error);
        setResultStates((current) =>
          withResultState(current, result.id, { status: 'failed', reason: message }),
        );
        toast.error(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsImporting(false);
        }
      }
    },
    [isImporting, isBatchImporting, applySelectedMedia],
  );

  const requestBatchImport = useCallback(() => {
    if (isImporting || isBatchImporting) {
      return;
    }
    if (isEmptyOrWhitespace(query)) {
      setSearchError('Enter a keyword to search for images.');
      setSearchStatus('error');
      return;
    }
    setIsBatchConfirmOpen(true);
  }, [query, isImporting, isBatchImporting]);

  const runBatchImport = useCallback(async () => {
    if (isImporting || isBatchImporting) {
      return;
    }

    const batchQuery = query.trim();
    if (isEmptyOrWhitespace(batchQuery)) {
      return;
    }

    searchAbortRef.current?.abort();
    searchRequestRef.current += 1;
    batchAbortRef.current?.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;
    const targetCount = batchCount;

    setIsBatchConfirmOpen(false);
    setIsBatchImporting(true);
    setBatchProgress({ current: 0, total: targetCount, activeResultId: null });
    setBatchSummary(null);
    setSearchStatus('loading');
    setSearchError(null);

    try {
      const payload = await searchMedia(batchQuery, 1, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      setResults(payload.results);
      setSearchedQuery(batchQuery);
      setSelectedResultId(payload.results[0]?.id ?? null);
      setSearchStatus('ready');

      const eligibleResults = payload.results
        .filter((result) => resultStates[result.id]?.status !== 'imported')
        .slice(0, targetCount);

      setBatchProgress({ current: 0, total: eligibleResults.length, activeResultId: null });

      const outcome = await importResultsInSequence(
        eligibleResults,
        controller.signal,
        (resultId, state) =>
          setResultStates((current) => withResultState(current, resultId, state)),
        setBatchProgress,
      );
      if (!outcome) {
        return;
      }

      const summary: BatchSummary = { ...outcome, matched: payload.results.length };
      setBatchSummary(summary);
      reportBatchOutcome(summary);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      const message = toErrorMessage(error);
      setSearchError(message);
      setSearchStatus('error');
      toast.error(message);
    } finally {
      if (batchAbortRef.current === controller) {
        batchAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setIsBatchImporting(false);
      }
    }
  }, [query, batchCount, isImporting, isBatchImporting, resultStates]);

  const handleBatchCountChange = useCallback((value: string) => {
    const nextCount = BATCH_COUNT_OPTIONS.find((option) => String(option) === value);
    if (nextCount) {
      setBatchCount(nextCount);
    }
  }, []);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = FINDER_TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % FINDER_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + FINDER_TABS.length) % FINDER_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = FINDER_TABS.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = FINDER_TABS[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const trimmedQuery = query.trim();
  const hasCurrentResults = searchStatus === 'ready' && searchedQuery === trimmedQuery;
  const eligibleResultCount = results.filter(
    (result) => resultStates[result.id]?.status !== 'imported',
  ).length;
  const plannedBatchCount = hasCurrentResults
    ? Math.min(batchCount, eligibleResultCount)
    : batchCount;

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogSurface className="flex max-h-[88dvh] max-w-5xl flex-col">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Find images
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Generate a new image or find a Creative Commons one, then add it to your library.
            </DialogPrimitive.Description>
          </div>

          <div
            role="tablist"
            aria-label="Image sources"
            className="flex gap-1 rounded-lg border border-border p-1"
          >
            {FINDER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`media-finder-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`media-finder-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  ref={(node) => {
                    tabRefs.current[tab.id] = node;
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={handleTabKeyDown}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {tab.id === 'generate' ? (
                    <SparklesIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <SearchIcon className="size-4" aria-hidden="true" />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div
              role="tabpanel"
              id="media-finder-panel-generate"
              aria-labelledby="media-finder-tab-generate"
              hidden={activeTab !== 'generate'}
            >
              <GeneratePanel
                prompt={prompt}
                status={generateStatus}
                error={generateError}
                media={generatedMedia}
                addLabel={onSelect ? 'Use this image' : 'Done'}
                onPromptChange={setPrompt}
                onGenerate={() => void runGenerate()}
                onAdd={runAddGenerated}
              />
            </div>

            <div
              role="tabpanel"
              id="media-finder-panel-search"
              aria-labelledby="media-finder-tab-search"
              hidden={activeTab !== 'search'}
            >
              <SearchPanel
                query={query}
                status={searchStatus}
                error={searchError}
                results={results}
                selectedResultId={selectedResultId}
                resultStates={resultStates}
                batchCount={batchCount}
                batchProgress={batchProgress}
                batchSummary={batchSummary}
                isImporting={isImporting}
                isBatchImporting={isBatchImporting}
                onQueryChange={setQuery}
                onSearch={() => void runSearch()}
                onSelectResult={setSelectedResultId}
                onImport={(result) => void runImport(result)}
                onBatchCountChange={handleBatchCountChange}
                onRequestBatchImport={requestBatchImport}
              />
            </div>
          </div>
        </DialogSurface>
      </DialogPrimitive.Root>

      <BatchImportDialog
        open={isBatchConfirmOpen}
        query={trimmedQuery}
        plannedCount={plannedBatchCount}
        isCountExact={hasCurrentResults}
        onOpenChange={setIsBatchConfirmOpen}
        onConfirm={() => void runBatchImport()}
      />
    </>
  );
}
