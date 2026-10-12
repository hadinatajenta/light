import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  imagePlugin,
  ListsToggle,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  type MDXEditorMethods,
  markdownShortcutPlugin,
  quotePlugin,
  Separator as ToolbarSeparator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import {
  ArrowLeftIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toSlug } from '@/lib/content/slug';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';

const PAGES_ENDPOINT = '/api/dashboard/pages';
const MEDIA_ENDPOINT = '/api/dashboard/media';
const SLUG_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 200;
const SEO_TITLE_MAX_LENGTH = 120;
const BOLD_ITALIC_OPTIONS: ('Bold' | 'Italic')[] = ['Bold', 'Italic'];
const LIST_OPTIONS: ('bullet' | 'number')[] = ['bullet', 'number'];
const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  text: 'Text',
  bash: 'Bash',
  css: 'CSS',
  html: 'HTML',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  yaml: 'YAML',
};

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

type PageStatus = 'draft' | 'published';
type PageFormMode = 'create' | 'edit';

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

interface PageInput {
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
}

interface PageFormValues {
  id: string;
  title: string;
  description: string;
  status: PageStatus;
  seoTitle: string;
  canonical: string;
  noindex: boolean;
  showInFooter: boolean;
  sortOrder: string;
}

interface PageFormProps {
  mode: PageFormMode;
  pageId?: string;
}

function mapFieldErrors(details: unknown): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!details || typeof details !== 'object') {
    return mapped;
  }
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return mapped;
  }
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }
    const field = (issue as { field?: unknown }).field;
    const message = (issue as { message?: unknown }).message;
    if (typeof field !== 'string' || typeof message !== 'string') {
      continue;
    }
    const key = field.split('.').pop() ?? field;
    if (!mapped[key]) {
      mapped[key] = message;
    }
  }
  return mapped;
}

async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const payload = await requestJson<{ media: { url: string } }>(MEDIA_ENDPOINT, {
      method: 'POST',
      body: formData,
    });
    return payload.media.url;
  } catch (error) {
    toast.error(toErrorMessage(error));
    throw error;
  }
}

function createDefaultValues(): PageFormValues {
  return {
    id: '',
    title: '',
    description: '',
    status: 'draft',
    seoTitle: '',
    canonical: '',
    noindex: false,
    showInFooter: true,
    sortOrder: '100',
  };
}

function toFormValues(page: PageRecord): PageFormValues {
  return {
    id: page.id,
    title: page.title,
    description: page.description,
    status: page.status,
    seoTitle: page.seoTitle ?? '',
    canonical: page.canonical ?? '',
    noindex: page.noindex,
    showInFooter: page.showInFooter,
    sortOrder: String(page.sortOrder),
  };
}

function PageToolbar() {
  return (
    <>
      <UndoRedo />
      <ToolbarSeparator />
      <BoldItalicUnderlineToggles options={BOLD_ITALIC_OPTIONS} />
      <BlockTypeSelect />
      <ToolbarSeparator />
      <ListsToggle options={LIST_OPTIONS} />
      <CreateLink />
      <InsertTable />
      <InsertImage />
      <InsertCodeBlock />
    </>
  );
}

function PageFormSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <span className="sr-only">Loading page</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

export default function PageForm({ mode, pageId }: PageFormProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    mode === 'edit' ? 'loading' : 'ready',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<PageFormValues>(createDefaultValues);
  const [body, setBody] = useState('');
  const [isIdEdited, setIsIdEdited] = useState(mode === 'edit');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const editorRef = useRef<MDXEditorMethods>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const seoTitleRef = useRef<HTMLInputElement>(null);
  const canonicalRef = useRef<HTMLInputElement>(null);
  const sortOrderRef = useRef<HTMLInputElement>(null);

  const loadPage = useCallback(async () => {
    if (mode !== 'edit') {
      return;
    }

    if (!pageId) {
      setLoadError('That page does not exist.');
      setStatus('error');
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<{ page: PageRecord }>(
        `${PAGES_ENDPOINT}/${encodeURIComponent(pageId)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setValues(toFormValues(payload.page));
      setBody(payload.page.body);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, [mode, pageId]);

  useEffect(() => {
    void loadPage();
    return () => controllerRef.current?.abort();
  }, [loadPage]);

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      imagePlugin({ imageUploadHandler: uploadImageFile }),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
      toolbarPlugin({ toolbarContents: () => <PageToolbar /> }),
    ],
    [],
  );

  const focusFirstError = (errors: Record<string, string>) => {
    if (errors.title) {
      titleRef.current?.focus();
      return;
    }
    if (errors.id) {
      idRef.current?.focus();
      return;
    }
    if (errors.description) {
      descriptionRef.current?.focus();
      return;
    }
    if (errors.seoTitle) {
      seoTitleRef.current?.focus();
      return;
    }
    if (errors.canonical) {
      canonicalRef.current?.focus();
      return;
    }
    if (errors.sortOrder) {
      sortOrderRef.current?.focus();
    }
  };

  const handleTitleChange = (title: string) => {
    setValues((current) => ({
      ...current,
      title,
      id: isIdEdited ? current.id : toSlug(title).slice(0, SLUG_MAX_LENGTH),
    }));
  };

  const handleIdChange = (id: string) => {
    setIsIdEdited(true);
    setValues((current) => ({ ...current, id }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const markdown = editorRef.current ? editorRef.current.getMarkdown() : body;
    const sortOrder = Number.parseInt(values.sortOrder, 10);
    const payload: PageInput = {
      id: values.id.trim(),
      title: values.title.trim(),
      description: values.description.trim(),
      body: markdown,
      status: values.status,
      seoTitle: values.seoTitle.trim() || null,
      canonical: values.canonical.trim() || null,
      noindex: values.noindex,
      showInFooter: values.showInFooter,
      sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
    };

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (mode === 'edit' && pageId) {
        await requestJson<{ page: PageRecord }>(`${PAGES_ENDPOINT}/${encodeURIComponent(pageId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Saved ${payload.title}.`);
      } else {
        await requestJson<{ page: PageRecord }>(PAGES_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created ${payload.title}.`);
      }
      window.location.href = '/dashboard/pages';
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const mapped = mapFieldErrors(error.details);
        setFieldErrors(mapped);
        focusFirstError(mapped);
      }
      const message = toErrorMessage(error);
      setFormError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const renderBody = () => {
    if (status === 'loading') {
      return <PageFormSkeleton />;
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load this page</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadPage()}>
              <RefreshCwIcon />
              Retry
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/dashboard/pages">Back to pages</a>
            </Button>
          </div>
        </div>
      );
    }

    const titleError = fieldErrors.title;
    const idError = fieldErrors.id;
    const descriptionError = fieldErrors.description;
    const statusError = fieldErrors.status;
    const seoTitleError = fieldErrors.seoTitle;
    const canonicalError = fieldErrors.canonical;
    const bodyError = fieldErrors.body;
    const sortOrderError = fieldErrors.sortOrder;

    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              ref={titleRef}
              value={values.title}
              autoComplete="off"
              maxLength={120}
              placeholder="About Light"
              disabled={isSubmitting}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? 'page-title-error' : undefined}
              onChange={(event) => handleTitleChange(event.target.value)}
            />
            {titleError ? (
              <p id="page-title-error" className="text-sm text-destructive">
                {titleError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="page-id">Slug</Label>
            <Input
              id="page-id"
              ref={idRef}
              value={values.id}
              autoComplete="off"
              spellCheck={false}
              maxLength={SLUG_MAX_LENGTH}
              placeholder="about"
              disabled={mode === 'edit' || isSubmitting}
              aria-invalid={Boolean(idError)}
              aria-describedby={idError ? 'page-id-error' : 'page-id-help'}
              onChange={(event) => handleIdChange(event.target.value)}
            />
            {idError ? (
              <p id="page-id-error" className="text-sm text-destructive">
                {idError}
              </p>
            ) : (
              <p id="page-id-help" className="text-xs text-muted-foreground">
                The page lives at /{values.id || 'slug'}/. Derived from the title until you edit it.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="page-description">Description</Label>
            <textarea
              id="page-description"
              ref={descriptionRef}
              rows={3}
              className={TEXTAREA_CLASS}
              value={values.description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              disabled={isSubmitting}
              aria-invalid={Boolean(descriptionError)}
              aria-describedby={
                descriptionError ? 'page-description-error' : 'page-description-help'
              }
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
            />
            {descriptionError ? (
              <p id="page-description-error" className="text-sm text-destructive">
                {descriptionError}
              </p>
            ) : (
              <p id="page-description-help" className="text-xs text-muted-foreground">
                One sentence that appears under the title and in search results.
              </p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <MDXEditor
            ref={editorRef}
            markdown={body}
            onChange={(markdown) => setBody(markdown)}
            plugins={plugins}
            placeholder="Write the page in Markdown."
            className="font-sans"
            contentEditableClassName="prose max-w-none min-h-[28rem] px-5 py-5 focus:outline-none dark:prose-invert"
          />
        </div>
        {bodyError ? (
          <p role="alert" className="text-sm text-destructive">
            {bodyError}
          </p>
        ) : null}

        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="page-status">Status</Label>
              <select
                id="page-status"
                className="select-control"
                value={values.status}
                disabled={isSubmitting}
                aria-invalid={Boolean(statusError)}
                aria-describedby={statusError ? 'page-status-error' : undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as PageStatus,
                  }))
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
              {statusError ? (
                <p id="page-status-error" className="text-sm text-destructive">
                  {statusError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="page-sort-order">Sort order</Label>
              <Input
                id="page-sort-order"
                ref={sortOrderRef}
                type="number"
                inputMode="numeric"
                min={-10000}
                max={10000}
                value={values.sortOrder}
                disabled={isSubmitting}
                aria-invalid={Boolean(sortOrderError)}
                aria-describedby={sortOrderError ? 'page-sort-order-error' : 'page-sort-order-help'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
              {sortOrderError ? (
                <p id="page-sort-order-error" className="text-sm text-destructive">
                  {sortOrderError}
                </p>
              ) : (
                <p id="page-sort-order-help" className="text-xs text-muted-foreground">
                  Lower numbers appear first in the footer.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="page-seo-title">SEO title</Label>
              <Input
                id="page-seo-title"
                ref={seoTitleRef}
                value={values.seoTitle}
                autoComplete="off"
                maxLength={SEO_TITLE_MAX_LENGTH}
                placeholder={values.title}
                disabled={isSubmitting}
                aria-invalid={Boolean(seoTitleError)}
                aria-describedby={seoTitleError ? 'page-seo-title-error' : 'page-seo-title-help'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, seoTitle: event.target.value }))
                }
              />
              {seoTitleError ? (
                <p id="page-seo-title-error" className="text-sm text-destructive">
                  {seoTitleError}
                </p>
              ) : (
                <p id="page-seo-title-help" className="text-xs text-muted-foreground">
                  Optional. Falls back to the title.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="page-canonical">Canonical URL</Label>
              <Input
                id="page-canonical"
                ref={canonicalRef}
                type="url"
                inputMode="url"
                value={values.canonical}
                autoComplete="off"
                placeholder="https://example.com/about/"
                disabled={isSubmitting}
                aria-invalid={Boolean(canonicalError)}
                aria-describedby={canonicalError ? 'page-canonical-error' : 'page-canonical-help'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, canonical: event.target.value }))
                }
              />
              {canonicalError ? (
                <p id="page-canonical-error" className="text-sm text-destructive">
                  {canonicalError}
                </p>
              ) : (
                <p id="page-canonical-help" className="text-xs text-muted-foreground">
                  Optional. Use when this page duplicates content published elsewhere.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                id="page-noindex"
                type="checkbox"
                className="size-4 rounded border-input accent-primary"
                checked={values.noindex}
                disabled={isSubmitting}
                onChange={(event) =>
                  setValues((current) => ({ ...current, noindex: event.target.checked }))
                }
              />
              <Label htmlFor="page-noindex">Hide from search engines</Label>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="page-show-in-footer"
                type="checkbox"
                className="size-4 rounded border-input accent-primary"
                checked={values.showInFooter}
                disabled={isSubmitting}
                onChange={(event) =>
                  setValues((current) => ({ ...current, showInFooter: event.target.checked }))
                }
              />
              <Label htmlFor="page-show-in-footer">Show in the footer</Label>
            </div>
          </div>
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" className="whitespace-nowrap">
            <a href="/dashboard/pages">Cancel</a>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {mode === 'edit'
              ? isSubmitting
                ? 'Saving'
                : 'Save changes'
              : isSubmitting
                ? 'Creating'
                : 'Create page'}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            {mode === 'edit' ? 'Edit page' : 'New page'}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {mode === 'edit'
              ? 'Update the content, SEO fields, and footer placement for this page.'
              : 'Pages render at the site root and can be linked from the footer.'}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="whitespace-nowrap">
          <a href="/dashboard/pages">
            <ArrowLeftIcon />
            Back to pages
          </a>
        </Button>
      </div>

      {renderBody()}
    </div>
  );
}
