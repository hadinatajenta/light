import { PlusIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const TAGS_ENDPOINT = '/api/dashboard/tags';
const MAX_SUGGESTIONS = 8;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface ApiSuccessEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
    throw new ApiRequestError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? 'The request could not be completed.',
    );
  }
  const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
  return envelope.data;
}

interface TagOption {
  value: string;
  isCreate: boolean;
}

interface TagInputProps {
  values: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export default function TagInput({ values, onChange, disabled = false }: TagInputProps) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestJson<{ tags: string[] }>(TAGS_ENDPOINT, { signal: controller.signal })
      .then((payload) => setAvailableTags(payload.tags))
      .catch(() => setAvailableTags([]));
    return () => controller.abort();
  }, []);

  const options = useMemo<TagOption[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selected = new Set(values.map((value) => value.toLowerCase()));
    const matches = availableTags
      .filter((tag) => !selected.has(tag.toLowerCase()))
      .filter((tag) => (normalizedQuery ? tag.toLowerCase().includes(normalizedQuery) : true))
      .slice(0, MAX_SUGGESTIONS)
      .map((tag) => ({ value: tag, isCreate: false }));

    const isNewTag =
      query.trim().length > 0 &&
      query.trim().length <= MAX_TAG_LENGTH &&
      !selected.has(normalizedQuery) &&
      !availableTags.some((tag) => tag.toLowerCase() === normalizedQuery);

    return isNewTag ? [...matches, { value: query.trim(), isCreate: true }] : matches;
  }, [availableTags, query, values]);

  const addTag = (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag || tag.length > MAX_TAG_LENGTH) {
      return;
    }
    if (values.length >= MAX_TAGS) {
      return;
    }
    if (values.some((value) => value.toLowerCase() === tag.toLowerCase())) {
      setQuery('');
      return;
    }
    onChange([...values, tag]);
    setQuery('');
    setActiveIndex(-1);
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((value) => value !== tag));
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (options.length === 0 ? -1 : (current + 1) % options.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        options.length === 0 ? -1 : (current - 1 + options.length) % options.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < options.length) {
        addTag(options[activeIndex].value);
        return;
      }
      addTag(query);
      return;
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Backspace' && query.length === 0 && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
  };

  const isInteractive = !disabled;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>Tags</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {values.length}/{MAX_TAGS}
        </span>
      </div>

      <div className="relative">
        <div
          className={cn(
            'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                aria-label={`Remove tag ${tag}`}
                className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={values.length === 0 ? 'Add a tag' : ''}
            className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {isOpen && isInteractive && options.length > 0 ? (
          <div
            id={listboxId}
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {options.map((option, index) => (
              <button
                key={option.isCreate ? `create-${option.value}` : option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(option.value)}
                onFocus={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                  index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                {option.isCreate ? (
                  <>
                    <PlusIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>
                      Create tag <span className="font-medium">{option.value}</span>
                    </span>
                  </>
                ) : (
                  option.value
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Press Enter to add. Suggestions come from tags already used on the site.
      </p>
    </div>
  );
}
