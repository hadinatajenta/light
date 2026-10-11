import {
  CheckIcon,
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
  importError: string | null;
  isImporting: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelectResult: (id: string) => void;
  onImport: (result: MediaSearchResult) => void;
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
  importError,
  isImporting,
  onQueryChange,
  onSearch,
  onSelectResult,
  onImport,
}: SearchPanelProps) {
  const isSearching = status === 'loading';
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;

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
          <Button type="submit" className="whitespace-nowrap" disabled={isSearching}>
            {isSearching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
            {isSearching ? 'Searching' : 'Search'}
          </Button>
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

      {isSearching ? (
        <ul aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {results.map((result) => {
              const isSelected = result.id === selectedResultId;
              return (
                <li key={result.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={result.title ? `Select ${result.title}` : 'Select this image'}
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

                {importError ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {importError}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="w-full whitespace-nowrap"
                  disabled={isImporting}
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
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const generateAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
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
      setSelectedResultId(null);
      setIsImporting(false);
      setImportError(null);
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
  }, [open]);

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      importAbortRef.current?.abort();
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
  }, [query]);

  const runImport = useCallback(
    async (result: MediaSearchResult) => {
      if (isImporting) {
        return;
      }

      importAbortRef.current?.abort();
      const controller = new AbortController();
      importAbortRef.current = controller;
      setIsImporting(true);
      setImportError(null);

      const input: ImportMediaInput = { imageUrl: result.imageUrl };
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

      try {
        const media = await importMedia(input, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        toast.success('Added the image to the library with its credit.');
        applySelectedMedia(media);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        const message = toErrorMessage(error);
        setImportError(message);
        toast.error(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsImporting(false);
        }
      }
    },
    [isImporting, applySelectedMedia],
  );

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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface className="flex max-h-[88dvh] max-w-3xl flex-col">
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
              importError={importError}
              isImporting={isImporting}
              onQueryChange={setQuery}
              onSearch={() => void runSearch()}
              onSelectResult={setSelectedResultId}
              onImport={(result) => void runImport(result)}
            />
          </div>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}
