import { CircleCheckIcon, CircleIcon } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export const TITLE_MAX_LENGTH = 70;
const DESCRIPTION_MIN_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 160;
const WORD_COUNT_TARGET = 300;
const READING_WORDS_PER_MINUTE = 200;

const SECTION_LABEL_CLASS_NAME =
  'text-[11px] font-medium tracking-[0.14em] uppercase text-muted-foreground';

const TEXTAREA_CLASS_NAME =
  'min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

const INTENT_OPTIONS = [
  { value: 'informational', label: 'Informational' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'navigational', label: 'Navigational' },
];

export interface SeoPanelFrontmatter {
  title: string;
  description: string;
  seoTitle: string;
  slug: string;
  coverUrl: string;
  coverAlt: string;
  canonical: string;
  focusKeyword: string;
  targetIntent: string;
  noindex: boolean;
  pubDate: string;
}

interface SeoPanelProps {
  frontmatter: SeoPanelFrontmatter;
  body: string;
  origin: string;
  disabled: boolean;
  effectiveSlug: string;
  descriptionError?: string;
  slugError?: string;
  coverAction?: ReactNode;
  onChange: (patch: Partial<SeoPanelFrontmatter>) => void;
}

interface ChecklistEntry {
  label: string;
  isPassing: boolean;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

function findFirstParagraph(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      continue;
    }
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      continue;
    }
    if (/^>/.test(trimmed) || /^```/.test(trimmed) || /^</.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return '';
}

function includesKeyword(haystack: string, keyword: string): boolean {
  return keyword.length > 0 && haystack.toLowerCase().includes(keyword.toLowerCase());
}

function hasH2WithKeyword(markdown: string, keyword: string): boolean {
  return markdown
    .split('\n')
    .some((line) => /^##\s+\S/.test(line) && includesKeyword(line, keyword));
}

function hasImageAltWithKeyword(markdown: string, keyword: string): boolean {
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(/g)) {
    if (includesKeyword(match[1], keyword)) {
      return true;
    }
  }
  return false;
}

function collectLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)/g)].map((match) => match[1]);
}

function hasInternalLink(markdown: string, origin: string): boolean {
  return collectLinkTargets(markdown).some((target) => {
    if (target.startsWith('/')) {
      return true;
    }
    return origin.length > 0 && target.startsWith(origin);
  });
}

function CharacterCounter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        value > max ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {value}/{max}
    </span>
  );
}

export default function SeoPanel({
  frontmatter,
  body,
  origin,
  disabled,
  effectiveSlug,
  descriptionError,
  slugError,
  coverAction,
  onChange,
}: SeoPanelProps) {
  const strippedBody = useMemo(() => stripMarkdown(body), [body]);
  const wordCount = useMemo(() => countWords(strippedBody), [strippedBody]);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / READING_WORDS_PER_MINUTE));
  const keyword = frontmatter.focusKeyword.trim();

  const checklist = useMemo<ChecklistEntry[]>(() => {
    if (!keyword) {
      return [];
    }
    return [
      { label: 'Keyword in the title', isPassing: includesKeyword(frontmatter.title, keyword) },
      {
        label: 'Keyword in the meta description',
        isPassing: includesKeyword(frontmatter.description, keyword),
      },
      {
        label: 'Keyword in the first paragraph',
        isPassing: includesKeyword(findFirstParagraph(body), keyword),
      },
      { label: 'Keyword in an H2 heading', isPassing: hasH2WithKeyword(body, keyword) },
      {
        label: 'Keyword in an image alt',
        isPassing:
          includesKeyword(frontmatter.coverAlt, keyword) || hasImageAltWithKeyword(body, keyword),
      },
      { label: `At least ${WORD_COUNT_TARGET} words`, isPassing: wordCount >= WORD_COUNT_TARGET },
      { label: 'At least one internal link', isPassing: hasInternalLink(body, origin) },
    ];
  }, [
    keyword,
    frontmatter.title,
    frontmatter.description,
    frontmatter.coverAlt,
    body,
    origin,
    wordCount,
  ]);

  const serpTitle = frontmatter.seoTitle.trim() || frontmatter.title.trim();
  const serpUrl = `${origin}/blog/${effectiveSlug || 'post-slug'}/`;
  const descriptionLength = frontmatter.description.length;

  return (
    <section
      aria-label="SEO"
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-[-0.02em] text-foreground">SEO</h2>
        <span className="font-sans text-xs tabular-nums text-muted-foreground">
          {wordCount} words - {readingMinutes} min read
        </span>
      </header>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL_CLASS_NAME}>Search preview</span>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="truncate font-sans text-xs text-muted-foreground">{serpUrl}</p>
          <p className="mt-1 truncate text-base text-foreground">
            {serpTitle || 'Post title appears here'}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {frontmatter.description.trim() || 'The meta description appears here.'}
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="post-slug">Slug</Label>
        </div>
        <Input
          id="post-slug"
          value={frontmatter.slug}
          onChange={(event) => onChange({ slug: event.target.value })}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          aria-invalid={Boolean(slugError)}
          aria-describedby={slugError ? 'post-slug-error post-slug-preview' : 'post-slug-preview'}
          placeholder="post-slug"
        />
        <p id="post-slug-preview" className="break-all font-mono text-xs text-muted-foreground">
          /blog/{effectiveSlug || 'post-slug'}/
        </p>
        {slugError ? (
          <p id="post-slug-error" className="text-sm text-destructive">
            {slugError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="post-seo-title">SEO title</Label>
          <CharacterCounter value={frontmatter.seoTitle.length} max={TITLE_MAX_LENGTH} />
        </div>
        <Input
          id="post-seo-title"
          value={frontmatter.seoTitle}
          onChange={(event) => onChange({ seoTitle: event.target.value })}
          disabled={disabled}
          maxLength={TITLE_MAX_LENGTH * 2}
          autoComplete="off"
          placeholder="Optional override for the browser title"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="post-description">Meta description</Label>
          <CharacterCounter value={descriptionLength} max={DESCRIPTION_MAX_LENGTH} />
        </div>
        <textarea
          id="post-description"
          value={frontmatter.description}
          onChange={(event) => onChange({ description: event.target.value })}
          disabled={disabled}
          rows={3}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? 'post-description-error' : 'post-description-hint'}
          placeholder="A concise summary shown in search results."
          className={TEXTAREA_CLASS_NAME}
        />
        <p id="post-description-hint" className="text-xs text-muted-foreground">
          Between {DESCRIPTION_MIN_LENGTH} and {DESCRIPTION_MAX_LENGTH} characters.
        </p>
        {descriptionError ? (
          <p id="post-description-error" className="text-sm text-destructive">
            {descriptionError}
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label htmlFor="post-focus-keyword">Focus keyword</Label>
        <Input
          id="post-focus-keyword"
          value={frontmatter.focusKeyword}
          onChange={(event) => onChange({ focusKeyword: event.target.value })}
          disabled={disabled}
          autoComplete="off"
          placeholder="ergonomic keyboard"
        />
        {keyword ? (
          <ul className="mt-1 flex flex-col gap-1.5">
            {checklist.map((entry) => (
              <li key={entry.label} className="flex items-center gap-2 text-sm">
                {entry.isPassing ? (
                  <CircleCheckIcon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                ) : (
                  <CircleIcon
                    className="size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                )}
                <span className={entry.isPassing ? 'text-foreground' : 'text-muted-foreground'}>
                  {entry.label}
                </span>
                <span className="sr-only">{entry.isPassing ? 'Passed' : 'Not passed'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Add a focus keyword to review the checklist.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="post-target-intent">Search intent</Label>
        <select
          id="post-target-intent"
          value={frontmatter.targetIntent}
          onChange={(event) => onChange({ targetIntent: event.target.value })}
          disabled={disabled}
          className="select-control"
        >
          <option value="">Not set</option>
          {INTENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Match the article to what the searcher wants
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <span className={SECTION_LABEL_CLASS_NAME}>Cover, sharing, and indexing</span>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="post-cover-url">Cover image URL</Label>
            {coverAction}
          </div>
          <Input
            id="post-cover-url"
            value={frontmatter.coverUrl}
            onChange={(event) => onChange({ coverUrl: event.target.value })}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="/media/example.jpg"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="post-cover-alt">Cover image alt text</Label>
          <Input
            id="post-cover-alt"
            value={frontmatter.coverAlt}
            onChange={(event) => onChange({ coverAlt: event.target.value })}
            disabled={disabled}
            autoComplete="off"
            placeholder="Describe the cover image"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="post-canonical">Canonical URL</Label>
          <Input
            id="post-canonical"
            type="url"
            value={frontmatter.canonical}
            onChange={(event) => onChange({ canonical: event.target.value })}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://lightscripts.com/blog/post-slug/"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="post-pub-date">Publish date</Label>
          <Input
            id="post-pub-date"
            type="date"
            value={frontmatter.pubDate}
            onChange={(event) => onChange({ pubDate: event.target.value })}
            disabled={disabled}
            required
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={frontmatter.noindex}
            onChange={(event) => onChange({ noindex: event.target.checked })}
            disabled={disabled}
            className="size-4 rounded border-input accent-[var(--primary)]"
          />
          Hide this post from search engines (noindex)
        </label>
      </div>
    </section>
  );
}
