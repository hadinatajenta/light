import {
  BanIcon,
  CircleCheckIcon,
  FileTextIcon,
  InboxIcon,
  ListPlusIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchXIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type KeyboardEvent,
  type RefObject,
  type SubmitEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import { mapFieldErrors } from './program-manager';
import ResearchNotes, {
  formatAbsoluteTime,
  formatRelativeTime,
  TOPIC_STATUS_LABELS,
  type TopicStatus,
  TopicStatusBadge,
} from './research-notes';

const TOPICS_ENDPOINT = '/api/dashboard/topics';
const AGENTS_ENDPOINT = '/api/dashboard/agents';
const CATEGORIES_ENDPOINT = '/api/dashboard/categories';
const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 140;
const KEYWORDS_MAX_COUNT = 12;
const KEYWORD_MAX_LENGTH = 60;
const BULK_MAX_LINES = 200;
const MAX_VISIBLE_KEYWORDS = 3;
const COLUMN_COUNT = 7;
const DASH = '-';
const SKELETON_ROWS = [
  'topic-skeleton-1',
  'topic-skeleton-2',
  'topic-skeleton-3',
  'topic-skeleton-4',
  'topic-skeleton-5',
  'topic-skeleton-6',
];
const STATUS_ORDER: TopicStatus[] = ['queued', 'researched', 'in_progress', 'used', 'blocked'];

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

export type TopicFilter = 'all' | TopicStatus;

interface TopicRecord {
  id: string;
  title: string;
  keywords: string[];
  category: string | null;
  status: TopicStatus;
  assignedAgentId: string | null;
  usedPostId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TopicCounts {
  queued: number;
  researched: number;
  inProgress: number;
  used: number;
  blocked: number;
}

interface TopicsPayload {
  topics: TopicRecord[];
  counts: TopicCounts;
}

interface CategoryOption {
  slug: string;
  label: string;
}

const FILTER_OPTIONS: { id: TopicFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...STATUS_ORDER.map((status) => ({ id: status, label: TOPIC_STATUS_LABELS[status] })),
];

function readCount(counts: TopicCounts, status: TopicStatus): number {
  const value = status === 'in_progress' ? counts.inProgress : counts[status];
  return typeof value === 'number' ? value : 0;
}

function canBlock(status: TopicStatus): boolean {
  return status === 'queued' || status === 'researched' || status === 'in_progress';
}

interface CategoryFieldProps {
  id: string;
  value: string;
  options: CategoryOption[];
  loadError: string | null;
  isRetrying: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
}

function CategoryField({
  id,
  value,
  options,
  loadError,
  isRetrying,
  onChange,
  onRetry,
}: CategoryFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Category</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value}
        disabled={loadError !== null}
        aria-describedby={loadError ? `${id}-error` : `${id}-help`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No category</option>
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.label}
          </option>
        ))}
      </select>
      {loadError ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {loadError}{' '}
          <button
            type="button"
            className="rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            disabled={isRetrying}
            onClick={onRetry}
          >
            {isRetrying ? 'Retrying' : 'Retry'}
          </button>
        </p>
      ) : (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          Group the topic so the writer can match it to products in the catalog.
        </p>
      )}
    </div>
  );
}

interface KeywordInputProps {
  values: string[];
  error: string | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (keywords: string[]) => void;
}

function KeywordInput({ values, error, inputRef, onChange }: KeywordInputProps) {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const helpId = `${inputId}-help`;

  const addKeyword = (rawValue: string) => {
    const keyword = rawValue.trim();
    if (keyword.length === 0 || keyword.length > KEYWORD_MAX_LENGTH) {
      return;
    }
    if (values.length >= KEYWORDS_MAX_COUNT) {
      return;
    }
    if (values.some((entry) => entry.toLowerCase() === keyword.toLowerCase())) {
      setQuery('');
      return;
    }
    onChange([...values, keyword]);
    setQuery('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKeyword(query);
      return;
    }
    if (event.key === 'Backspace' && query.length === 0 && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>Keywords</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {values.length}/{KEYWORDS_MAX_COUNT}
        </span>
      </div>

      <div
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
          error && 'border-destructive',
        )}
      >
        {values.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground"
          >
            {keyword}
            <button
              type="button"
              aria-label={`Remove keyword ${keyword}`}
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => onChange(values.filter((entry) => entry !== keyword))}
            >
              <XIcon className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          ref={inputRef}
          value={query}
          maxLength={KEYWORD_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          placeholder={values.length === 0 ? 'Add a keyword' : ''}
          aria-invalid={Boolean(error)}
          aria-describedby={helpId}
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <p
        id={helpId}
        className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
      >
        {error ?? `Press Enter to add. Up to ${KEYWORDS_MAX_COUNT} keywords.`}
      </p>
    </div>
  );
}

interface CategoryDialogProps {
  isOpen: boolean;
  categories: CategoryOption[];
  categoriesError: string | null;
  isRetryingCategories: boolean;
  onRetryCategories: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: () => void;
}

function CreateTopicDialog({
  isOpen,
  categories,
  categoriesError,
  isRetryingCategories,
  onRetryCategories,
  onOpenChange,
  onCreated,
}: CategoryDialogProps) {
  const [title, setTitle] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const keywordRef = useRef<HTMLInputElement>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTitle('');
    setKeywords([]);
    setCategory('');
    setFieldErrors({});
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    return () => mutationControllerRef.current?.abort();
  }, []);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedTitle = title.trim();
    const validationErrors: Record<string, string> = {};

    if (trimmedTitle.length < TITLE_MIN_LENGTH || trimmedTitle.length > TITLE_MAX_LENGTH) {
      validationErrors.title = `Title must be between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH} characters.`;
    }
    if (keywords.length > KEYWORDS_MAX_COUNT) {
      validationErrors.keywords = `Use at most ${KEYWORDS_MAX_COUNT} keywords.`;
    }
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.title) {
        titleRef.current?.focus();
      } else {
        keywordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      await requestJson<{ topic: TopicRecord }>(TOPICS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          title: trimmedTitle,
          keywords,
          category: category.length > 0 ? category : null,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      toast.success(`Queued "${trimmedTitle}".`);
      onCreated();
      onOpenChange(false);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiRequestError) {
        const mapped = mapFieldErrors(error.details);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          if (mapped.title) {
            titleRef.current?.focus();
          } else if (mapped.keywords) {
            keywordRef.current?.focus();
          }
        }
      }
      const message = toErrorMessage(error);
      setFieldErrors((current) => ({ ...current, form: message }));
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="max-h-[90dvh] overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            New topic
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Queue a topic for the writer agents. They claim the oldest queued topic first.
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-title">Title</Label>
            <Input
              id="topic-title"
              ref={titleRef}
              value={title}
              autoComplete="off"
              maxLength={TITLE_MAX_LENGTH}
              placeholder="Best standing desks for a home office under 800 dollars"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'topic-title-error' : 'topic-title-help'}
              onChange={(event) => setTitle(event.target.value)}
            />
            {fieldErrors.title ? (
              <p id="topic-title-error" className="text-sm text-destructive">
                {fieldErrors.title}
              </p>
            ) : (
              <p id="topic-title-help" className="text-xs text-muted-foreground">
                Between {TITLE_MIN_LENGTH} and {TITLE_MAX_LENGTH} characters.
              </p>
            )}
          </div>

          <KeywordInput
            values={keywords}
            error={fieldErrors.keywords}
            inputRef={keywordRef}
            onChange={setKeywords}
          />

          <CategoryField
            id="topic-category"
            value={category}
            options={categories}
            loadError={categoriesError}
            isRetrying={isRetryingCategories}
            onChange={setCategory}
            onRetry={onRetryCategories}
          />

          {fieldErrors.form ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {fieldErrors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="whitespace-nowrap"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              {isSubmitting ? 'Adding' : 'Add to queue'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function BulkAddDialog({
  isOpen,
  categories,
  categoriesError,
  isRetryingCategories,
  onRetryCategories,
  onOpenChange,
  onCreated,
}: CategoryDialogProps) {
  const [lines, setLines] = useState('');
  const [category, setCategory] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setLines('');
    setCategory('');
    setFieldErrors({});
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    return () => mutationControllerRef.current?.abort();
  }, []);

  const parsedLines = useMemo(() => {
    const entries = lines
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const usable = entries.filter(
      (line) => line.length >= TITLE_MIN_LENGTH && line.length <= TITLE_MAX_LENGTH,
    );
    const skipped = entries.length - usable.length;
    return { usable, skipped };
  }, [lines]);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (parsedLines.usable.length === 0) {
      setFieldErrors({
        lines: `Add at least one line of ${TITLE_MIN_LENGTH} to ${TITLE_MAX_LENGTH} characters.`,
      });
      textareaRef.current?.focus();
      return;
    }
    if (parsedLines.usable.length > BULK_MAX_LINES) {
      setFieldErrors({
        lines: `Add at most ${BULK_MAX_LINES} topics at once. You pasted ${parsedLines.usable.length}.`,
      });
      textareaRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      const payload = await requestJson<{ created: number; topics: TopicRecord[] }>(
        TOPICS_ENDPOINT,
        {
          method: 'POST',
          body: JSON.stringify({
            lines: parsedLines.usable.join('\n'),
            category: category.length > 0 ? category : null,
          }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      if (payload.created === 0) {
        toast.info('Nothing was queued. Every line was skipped by the server.');
        return;
      }
      toast.success(`Queued ${payload.created} ${payload.created === 1 ? 'topic' : 'topics'}.`);
      onCreated();
      onOpenChange(false);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiRequestError) {
        const mapped = mapFieldErrors(error.details);
        if (mapped.lines) {
          setFieldErrors({ lines: mapped.lines });
          textareaRef.current?.focus();
        }
      }
      const message = toErrorMessage(error);
      setFieldErrors((current) => ({ ...current, form: message }));
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const skippedHelp =
    parsedLines.skipped > 0
      ? ` ${parsedLines.skipped} of the current ${parsedLines.skipped === 1 ? 'line is' : 'lines are'} outside that range and will be skipped.`
      : '';

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Bulk add topics
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            One topic title per line. The writer agents claim them in the order they were added.
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="bulk-topic-lines">Topics</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {parsedLines.usable.length} ready
              </span>
            </div>
            <textarea
              id="bulk-topic-lines"
              ref={textareaRef}
              rows={8}
              className={TEXTAREA_CLASS}
              value={lines}
              spellCheck={false}
              placeholder={
                'Best standing desks under 800 dollars\nHow to choose a mesh office chair'
              }
              aria-invalid={Boolean(fieldErrors.lines)}
              aria-describedby={
                fieldErrors.lines ? 'bulk-topic-lines-error' : 'bulk-topic-lines-help'
              }
              onChange={(event) => setLines(event.target.value)}
            />
            {fieldErrors.lines ? (
              <p id="bulk-topic-lines-error" className="text-sm text-destructive">
                {fieldErrors.lines}
              </p>
            ) : (
              <p id="bulk-topic-lines-help" className="text-xs text-muted-foreground">
                One title per line, {TITLE_MIN_LENGTH} to {TITLE_MAX_LENGTH} characters, up to{' '}
                {BULK_MAX_LINES} lines.{skippedHelp}
              </p>
            )}
          </div>

          <CategoryField
            id="bulk-topic-category"
            value={category}
            options={categories}
            loadError={categoriesError}
            isRetrying={isRetryingCategories}
            onChange={setCategory}
            onRetry={onRetryCategories}
          />

          {fieldErrors.form ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {fieldErrors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="whitespace-nowrap"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <ListPlusIcon />}
              {isSubmitting ? 'Adding' : 'Add topics'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function DeleteTopicDialog({
  topic,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: {
  topic: TopicRecord | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open={topic !== null}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Delete topic
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {topic
              ? `Delete "${topic.title}"? The queue will move on to the next topic.`
              : 'Confirm the removal of this topic.'}
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
            className="whitespace-nowrap"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="whitespace-nowrap"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            {isDeleting ? 'Deleting' : 'Delete topic'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function TopicStatusStrip({
  counts,
  isLoading,
}: {
  counts: TopicCounts | null;
  isLoading: boolean;
}) {
  if (counts === null) {
    if (isLoading) {
      return (
        <section aria-label="Queue counts" className="rounded-xl border border-border bg-card p-4">
          <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <span className="sr-only">Loading queue counts</span>
            {STATUS_ORDER.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section
        aria-label="Queue counts"
        className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
      >
        Queue counts are unavailable right now.
      </section>
    );
  }

  return (
    <section aria-label="Queue counts" className="rounded-xl border border-border bg-card p-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="flex flex-col gap-1">
            <dt className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {TOPIC_STATUS_LABELS[status]}
            </dt>
            <dd className="text-xl font-semibold tabular-nums text-foreground">
              {readCount(counts, status)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface TopicManagerProps {
  initialStatus: TopicFilter;
}

export default function TopicManager({ initialStatus }: TopicManagerProps) {
  const [filter, setFilter] = useState<TopicFilter>(initialStatus);
  const [topics, setTopics] = useState<TopicRecord[]>([]);
  const [counts, setCounts] = useState<TopicCounts | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agentNames, setAgentNames] = useState<Map<string, string>>(new Map());
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isRetryingCategories, setIsRetryingCategories] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<TopicRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingTopicId, setPendingTopicId] = useState<string | null>(null);
  const [notesTopic, setNotesTopic] = useState<TopicRecord | null>(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const listControllerRef = useRef<AbortController | null>(null);
  const latestRequestRef = useRef(0);
  const agentsControllerRef = useRef<AbortController | null>(null);
  const categoriesControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  const loadTopics = useCallback(
    async (isSilent = false) => {
      listControllerRef.current?.abort();
      const controller = new AbortController();
      listControllerRef.current = controller;
      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;

      if (isSilent) {
        setIsRefreshing(true);
      } else {
        setStatus('loading');
        setLoadError(null);
      }

      try {
        const params = new URLSearchParams();
        if (filter !== 'all') {
          params.set('status', filter);
        }
        const query = params.toString();

        const payload = await requestJson<TopicsPayload>(
          query.length > 0 ? `${TOPICS_ENDPOINT}?${query}` : TOPICS_ENDPOINT,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || latestRequestRef.current !== requestId) {
          return;
        }
        setTopics(payload.topics);
        setCounts(payload.counts);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted || latestRequestRef.current !== requestId) {
          return;
        }
        setLoadError(toErrorMessage(error));
        if (!isSilent) {
          setStatus('error');
        }
      } finally {
        if (!controller.signal.aborted && latestRequestRef.current === requestId) {
          setIsRefreshing(false);
        }
      }
    },
    [filter],
  );

  const loadAgents = useCallback(async () => {
    agentsControllerRef.current?.abort();
    const controller = new AbortController();
    agentsControllerRef.current = controller;

    try {
      const payload = await requestJson<{ agents: Array<{ id: string; name: string }> }>(
        AGENTS_ENDPOINT,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setAgentNames(new Map(payload.agents.map((agent) => [agent.id, agent.name])));
    } catch {
      if (!controller.signal.aborted) {
        setAgentNames(new Map());
      }
    }
  }, []);

  const loadCategories = useCallback(async () => {
    categoriesControllerRef.current?.abort();
    const controller = new AbortController();
    categoriesControllerRef.current = controller;
    setIsRetryingCategories(true);

    try {
      const payload = await requestJson<{
        categories: Array<{ slug: string; label: string }>;
      }>(CATEGORIES_ENDPOINT, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      setCategories(payload.categories.map(({ slug, label }) => ({ slug, label })));
      setCategoriesError(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setCategoriesError(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsRetryingCategories(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTopics(false);
    return () => listControllerRef.current?.abort();
  }, [loadTopics]);

  useEffect(() => {
    void loadAgents();
    return () => agentsControllerRef.current?.abort();
  }, [loadAgents]);

  useEffect(() => {
    void loadCategories();
    return () => categoriesControllerRef.current?.abort();
  }, [loadCategories]);

  useEffect(() => {
    return () => mutationControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  }, [filter]);

  const categoryLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const category of categories) {
      labels.set(category.slug, category.label);
    }
    return labels;
  }, [categories]);

  const handleStatusChange = async (
    topic: TopicRecord,
    nextStatus: TopicStatus,
    successMessage: string,
  ) => {
    if (pendingTopicId !== null || isDeleting) {
      return;
    }

    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    setPendingTopicId(topic.id);
    setTopics((current) =>
      current.map((entry) =>
        entry.id === topic.id
          ? {
              ...entry,
              status: nextStatus,
              assignedAgentId: nextStatus === 'queued' ? null : entry.assignedAgentId,
            }
          : entry,
      ),
    );

    try {
      await requestJson<{ topic: TopicRecord }>(
        `${TOPICS_ENDPOINT}/${encodeURIComponent(topic.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: nextStatus }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      toast.success(successMessage);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setTopics((current) =>
        current.map((entry) =>
          entry.id === topic.id
            ? { ...entry, status: topic.status, assignedAgentId: topic.assignedAgentId }
            : entry,
        ),
      );
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setPendingTopicId(null);
        void loadTopics(true);
      }
    }
  };

  const handleDelete = async () => {
    const target = topicToDelete;
    if (!target || isDeleting || pendingTopicId !== null) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${TOPICS_ENDPOINT}/${encodeURIComponent(target.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setTopics((current) => current.filter((entry) => entry.id !== target.id));
      toast.success(`Deleted "${target.title}".`);
      setTopicToDelete(null);
      void loadTopics(true);
    } catch (error) {
      if (controller.signal.aborted) {
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

  const hasRows = topics.length > 0;
  const isFiltered = filter !== 'all';
  const isBusy = status === 'loading' || isRefreshing;
  const showSkeleton = status === 'loading' && !hasRows;
  const showErrorState = status === 'error' && !hasRows;
  const showEmptyState = status === 'ready' && !hasRows;
  const isRowActionBusy = pendingTopicId !== null || isDeleting;

  const resultSummary = hasRows
    ? `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`
    : isFiltered
      ? `No ${TOPIC_STATUS_LABELS[filter]} topics`
      : 'No topics';

  const openNotes = (topic: TopicRecord) => {
    setNotesTopic(topic);
    setIsNotesOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Topics
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Writer agents claim the oldest queued topic first. The scrapper agent stores research
            notes on a topic so the writer has evidence to work from.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap"
            onClick={() => setIsBulkOpen(true)}
          >
            <ListPlusIcon />
            Bulk add
          </Button>
          <Button type="button" className="whitespace-nowrap" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon />
            New topic
          </Button>
        </div>
      </div>

      <TopicStatusStrip counts={counts} isLoading={status === 'loading' && counts === null} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter topics by status</legend>
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={filter === option.id ? 'default' : 'outline'}
              aria-pressed={filter === option.id}
              className="whitespace-nowrap"
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
        <p role="status" aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
          {status === 'loading' && !hasRows
            ? 'Loading topics'
            : isBusy
              ? 'Updating'
              : resultSummary}
        </p>
      </div>

      {loadError !== null && hasRows ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadTopics(true)}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead>Assigned agent</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isBusy && hasRows && 'opacity-60')}>
            {showSkeleton
              ? SKELETON_ROWS.map((rowKey) => (
                  <TableRow key={rowKey}>
                    <TableCell>
                      <Skeleton className="h-4 w-56" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-32 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="size-8" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {showErrorState ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-44 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <TriangleAlertIcon className="size-8 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Could not load the topic queue
                      </p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadTopics(false)}
                    >
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showEmptyState ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-52 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    {isFiltered ? (
                      <SearchXIcon className="size-8 text-muted-foreground" />
                    ) : (
                      <InboxIcon className="size-8 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isFiltered ? 'No topics with this status' : 'The topic queue is empty'}
                      </p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                        {isFiltered
                          ? 'Nothing is in this state right now. Show all topics to see the rest of the queue.'
                          : 'Writer agents draw the oldest queued topic first. Add topics one at a time or paste a list to fill the queue. The scrapper agent stores research notes on each topic so the writer has evidence to cite.'}
                      </p>
                    </div>
                    {isFiltered ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFilter('all')}
                      >
                        Show all topics
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
                          <PlusIcon />
                          New topic
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setIsBulkOpen(true)}
                        >
                          <ListPlusIcon />
                          Bulk add
                        </Button>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {hasRows
              ? topics.map((topic) => {
                  const assignedName =
                    topic.assignedAgentId !== null
                      ? agentNames.get(topic.assignedAgentId)
                      : undefined;
                  const isPending = pendingTopicId === topic.id;

                  return (
                    <TableRow key={topic.id}>
                      <TableCell
                        className="max-w-[24rem] leading-snug whitespace-normal font-medium text-foreground"
                        title={topic.title}
                      >
                        {topic.title}
                      </TableCell>
                      <TableCell>
                        <TopicStatusBadge status={topic.status} />
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                        {topic.category !== null
                          ? (categoryLabels.get(topic.category) ?? topic.category)
                          : DASH}
                      </TableCell>
                      <TableCell className="max-w-[16rem] whitespace-normal">
                        {topic.keywords.length === 0 ? (
                          <span className="text-muted-foreground">{DASH}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {topic.keywords.slice(0, MAX_VISIBLE_KEYWORDS).map((keyword) => (
                              <Badge key={keyword} variant="secondary" className="font-normal">
                                {keyword}
                              </Badge>
                            ))}
                            {topic.keywords.length > MAX_VISIBLE_KEYWORDS ? (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                +{topic.keywords.length - MAX_VISIBLE_KEYWORDS}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                        {topic.assignedAgentId === null ? (
                          'Unassigned'
                        ) : (
                          <span title={assignedName ?? topic.assignedAgentId}>
                            {assignedName ?? `Agent ${topic.assignedAgentId.slice(0, 8)}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <time
                          dateTime={topic.createdAt}
                          title={formatAbsoluteTime(topic.createdAt)}
                          className="tabular-nums"
                        >
                          {formatRelativeTime(topic.createdAt)}
                        </time>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={isRowActionBusy}
                              aria-label={`Actions for ${topic.title}`}
                            >
                              {isPending ? (
                                <Loader2Icon className="animate-spin" />
                              ) : (
                                <MoreHorizontalIcon />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openNotes(topic)}>
                              <FileTextIcon />
                              Notes
                            </DropdownMenuItem>
                            {topic.status === 'used' ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  void handleStatusChange(
                                    topic,
                                    'queued',
                                    `"${topic.title}" is back in the queue.`,
                                  )
                                }
                              >
                                <RotateCcwIcon />
                                Requeue
                              </DropdownMenuItem>
                            ) : null}
                            {topic.status === 'blocked' ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  void handleStatusChange(
                                    topic,
                                    'queued',
                                    `Unblocked "${topic.title}". It is back in the queue.`,
                                  )
                                }
                              >
                                <CircleCheckIcon />
                                Unblock
                              </DropdownMenuItem>
                            ) : null}
                            {canBlock(topic.status) ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  void handleStatusChange(
                                    topic,
                                    'blocked',
                                    `Blocked "${topic.title}". Writer agents will skip it.`,
                                  )
                                }
                              >
                                <BanIcon />
                                Block
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                setDeleteError(null);
                                setTopicToDelete(topic);
                              }}
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

      <CreateTopicDialog
        isOpen={isCreateOpen}
        categories={categories}
        categoriesError={categoriesError}
        isRetryingCategories={isRetryingCategories}
        onRetryCategories={() => void loadCategories()}
        onOpenChange={setIsCreateOpen}
        onCreated={() => void loadTopics(true)}
      />

      <BulkAddDialog
        isOpen={isBulkOpen}
        categories={categories}
        categoriesError={categoriesError}
        isRetryingCategories={isRetryingCategories}
        onRetryCategories={() => void loadCategories()}
        onOpenChange={setIsBulkOpen}
        onCreated={() => void loadTopics(true)}
      />

      <DeleteTopicDialog
        topic={topicToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setTopicToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDelete()}
      />

      <ResearchNotes
        topic={
          notesTopic
            ? { id: notesTopic.id, title: notesTopic.title, status: notesTopic.status }
            : null
        }
        isOpen={isNotesOpen}
        onOpenChange={(isOpen) => {
          setIsNotesOpen(isOpen);
          if (!isOpen) {
            setNotesTopic(null);
          }
        }}
      />
    </div>
  );
}
