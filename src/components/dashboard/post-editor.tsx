import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
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
  EyeOffIcon,
  GlobeIcon,
  ImagesIcon,
  Loader2Icon,
  MonitorPlayIcon,
  RefreshCwIcon,
  SaveIcon,
} from 'lucide-react';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import CategorySelect from '@/components/dashboard/category-select';
import MediaPicker from '@/components/dashboard/media-picker';
import SeoPanel, { type SeoPanelFrontmatter } from '@/components/dashboard/seo-panel';
import TagInput from '@/components/dashboard/tag-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toSlug } from '@/lib/content/slug';
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';

const POSTS_ENDPOINT = '/api/dashboard/posts';
const MEDIA_ENDPOINT = '/api/dashboard/media';
const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 70;
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

type PostStatus = 'draft' | 'published' | 'archived';

const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

interface PostFrontmatterForm {
  title: string;
  description: string;
  seoTitle: string;
  slug: string;
  status: PostStatus;
  category: string;
  tags: string[];
  pubDate: string;
  coverUrl: string;
  coverAlt: string;
  canonical: string;
  noindex: boolean;
  focusKeyword: string;
  affiliate: boolean;
}

interface PostDocumentResponse {
  id: string;
  sha: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

interface SavedPostResponse {
  id: string;
  sha: string;
  status?: PostStatus;
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readStatus(value: unknown): PostStatus {
  return value === 'published' || value === 'archived' ? value : 'draft';
}

function readIsoDate(value: unknown): string {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return '';
}

function createEmptyForm(): PostFrontmatterForm {
  return {
    title: '',
    description: '',
    seoTitle: '',
    slug: '',
    status: 'draft',
    category: '',
    tags: [],
    pubDate: '',
    coverUrl: '',
    coverAlt: '',
    canonical: '',
    noindex: false,
    focusKeyword: '',
    affiliate: false,
  };
}

function toForm(frontmatter: Record<string, unknown>, fallbackSlug: string): PostFrontmatterForm {
  return {
    title: readString(frontmatter.title),
    description: readString(frontmatter.description),
    seoTitle: readString(frontmatter.seoTitle),
    slug: readString(frontmatter.slug) || fallbackSlug,
    status: readStatus(frontmatter.status),
    category: readString(frontmatter.category),
    tags: readTags(frontmatter.tags),
    pubDate: readIsoDate(frontmatter.pubDate),
    coverUrl: readString(frontmatter.coverUrl),
    coverAlt: readString(frontmatter.coverAlt),
    canonical: readString(frontmatter.canonical),
    noindex: readBoolean(frontmatter.noindex),
    focusKeyword: readString(frontmatter.focusKeyword),
    affiliate: readBoolean(frontmatter.affiliate),
  };
}

function buildFrontmatterPayload(
  form: PostFrontmatterForm,
  status: PostStatus,
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description.trim(),
    status,
    tags: form.tags,
    pubDate: form.pubDate || todayIsoDate(),
    noindex: form.noindex,
    affiliate: form.affiliate,
    faq: [],
  };

  const seoTitle = form.seoTitle.trim();
  if (seoTitle) {
    frontmatter.seoTitle = seoTitle;
  }
  if (form.category) {
    frontmatter.category = form.category;
  }
  const coverUrl = form.coverUrl.trim();
  if (coverUrl) {
    frontmatter.coverUrl = coverUrl;
  }
  const coverAlt = form.coverAlt.trim();
  if (coverAlt) {
    frontmatter.coverAlt = coverAlt;
  }
  const canonical = form.canonical.trim();
  if (canonical) {
    frontmatter.canonical = canonical;
  }
  const focusKeyword = form.focusKeyword.trim();
  if (focusKeyword) {
    frontmatter.focusKeyword = focusKeyword;
  }

  return frontmatter;
}

function toVideoEmbed(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  const youtubeMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/,
  );
  if (youtubeMatch) {
    return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeMatch[1]}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" title="Vimeo video" width="560" height="315" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }
  return `<iframe src="${url}" title="Embedded video" width="560" height="315" allowfullscreen></iframe>`;
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

function EditorToolbar({ editorRef }: { editorRef: RefObject<MDXEditorMethods | null> }) {
  const handleInsertVideo = () => {
    const input = window.prompt('Paste a YouTube or Vimeo URL to embed.');
    if (!input) {
      return;
    }
    const embed = toVideoEmbed(input);
    if (!embed) {
      toast.error('Enter a valid http or https video URL.');
      return;
    }
    editorRef.current?.insertMarkdown(`\n\n${embed}\n\n`);
  };

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
      <ToolbarSeparator />
      <ButtonWithTooltip title="Embed a video" onClick={handleInsertVideo}>
        <MonitorPlayIcon className="size-4" aria-hidden="true" />
      </ButtonWithTooltip>
    </>
  );
}

function EditorLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <span className="sr-only">Loading the editor</span>
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[28rem] w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-[32rem] w-full" />
      </div>
    </div>
  );
}

interface PostEditorProps {
  postId?: string;
}

export default function PostEditor({ postId }: PostEditorProps) {
  const [form, setForm] = useState<PostFrontmatterForm>(createEmptyForm);
  const [body, setBody] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(
    postId ? 'loading' : 'ready',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSlugEdited, setIsSlugEdited] = useState(Boolean(postId));
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'publish' | 'unpublish' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const editorRef = useRef<MDXEditorMethods>(null);
  const requestRef = useRef<AbortController | null>(null);
  const isDirtyRef = useRef(false);

  const markDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const loadPost = useCallback(async () => {
    if (!postId) {
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoadStatus('loading');
    setLoadError(null);

    try {
      const document = await requestJson<PostDocumentResponse>(
        `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setForm(toForm(document.frontmatter, postId));
      setBody(document.body);
      setSha(document.sha);
      setIsSlugEdited(true);
      markDirty(false);
      setLoadStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setLoadStatus('error');
    }
  }, [postId, markDirty]);

  useEffect(() => {
    if (postId) {
      void loadPost();
    }
    return () => requestRef.current?.abort();
  }, [postId, loadPost]);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!postId) {
      setForm((current) => (current.pubDate ? current : { ...current, pubDate: todayIsoDate() }));
    }
  }, [postId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) {
        return;
      }
      event.preventDefault();
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirtyRef.current || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a') : null;
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) {
        return;
      }
      const anchorTarget = anchor.getAttribute('target');
      if (anchorTarget && anchorTarget !== '_self') {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) {
        return;
      }
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }
      if (window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);

  const handleTitleChange = (title: string) => {
    setForm((current) => ({
      ...current,
      title,
      slug: isSlugEdited ? current.slug : toSlug(title),
    }));
    markDirty(true);
  };

  const handleFrontmatterChange = useCallback(
    (patch: Partial<PostFrontmatterForm>) => {
      setForm((current) => ({ ...current, ...patch }));
      markDirty(true);
    },
    [markDirty],
  );

  const handleSeoChange = useCallback(
    (patch: Partial<SeoPanelFrontmatter>) => {
      if (patch.slug !== undefined) {
        setIsSlugEdited(true);
      }
      setForm((current) => ({ ...current, ...patch }));
      markDirty(true);
    },
    [markDirty],
  );

  const handleCoverSelect = useCallback(
    (url: string, alt: string) => {
      handleSeoChange({ coverUrl: url, coverAlt: alt });
    },
    [handleSeoChange],
  );

  const handleBodyChange = useCallback(
    (markdown: string, initialMarkdownNormalize: boolean) => {
      setBody(markdown);
      if (!initialMarkdownNormalize) {
        markDirty(true);
      }
    },
    [markDirty],
  );

  const applyRequestError = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.code === 'REVISION_CONFLICT') {
        const message = 'This post changed elsewhere. Reload the page and try again.';
        setFormError(message);
        toast.error(message);
        return;
      }
      const mapped = mapFieldErrors(error.details);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }
      setFormError(error.message);
      toast.error(error.message);
      return;
    }
    const message = toErrorMessage(error);
    setFormError(message);
    toast.error(message);
  }, []);

  const persist = useCallback(
    async (targetStatus: PostStatus) => {
      if (pendingAction) {
        return;
      }
      const markdown = editorRef.current ? editorRef.current.getMarkdown() : body;
      const effectiveSlug = (form.slug || toSlug(form.title)).trim();
      if (!effectiveSlug) {
        const message = 'Add a title or a slug before saving.';
        setFormError(message);
        toast.error(message);
        return;
      }

      setFieldErrors({});
      setFormError(null);
      setPendingAction(targetStatus === 'published' ? 'publish' : 'save');

      try {
        if (postId) {
          const putStatus = targetStatus === 'published' ? form.status : targetStatus;
          const updated = await requestJson<SavedPostResponse>(
            `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slug: effectiveSlug,
                body: markdown,
                frontmatter: buildFrontmatterPayload(form, putStatus),
                expectedSha: sha ?? undefined,
              }),
            },
          );
          setSha(updated.sha);

          if (targetStatus === 'published' && form.status !== 'published') {
            await requestJson<{ id: string; status: PostStatus }>(
              `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}/status`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'published', expectedSha: updated.sha }),
              },
            );
            const refreshed = await requestJson<PostDocumentResponse>(
              `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}`,
            );
            setSha(refreshed.sha);
          }

          setForm((current) => ({ ...current, slug: effectiveSlug, status: targetStatus }));
          markDirty(false);
          toast.success(targetStatus === 'published' ? 'Post published.' : 'Draft saved.');
        } else {
          const created = await requestJson<SavedPostResponse>(POSTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug: effectiveSlug,
              body: markdown,
              frontmatter: buildFrontmatterPayload(form, targetStatus),
              expectedSha: sha ?? undefined,
            }),
          });
          markDirty(false);
          toast.success(targetStatus === 'published' ? 'Post published.' : 'Draft saved.');
          window.location.assign(`/dashboard/posts/${encodeURIComponent(created.id)}/edit`);
        }
      } catch (error) {
        applyRequestError(error);
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, body, form, postId, sha, markDirty, applyRequestError],
  );

  const handleUnpublish = useCallback(async () => {
    if (!postId || pendingAction) {
      return;
    }
    setFormError(null);
    setPendingAction('unpublish');
    try {
      await requestJson<{ id: string; status: PostStatus }>(
        `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'draft', expectedSha: sha ?? undefined }),
        },
      );
      const refreshed = await requestJson<PostDocumentResponse>(
        `${POSTS_ENDPOINT}/${encodeURIComponent(postId)}`,
      );
      setSha(refreshed.sha);
      setForm((current) => ({ ...current, status: 'draft' }));
      toast.success('Post moved back to draft.');
    } catch (error) {
      applyRequestError(error);
    } finally {
      setPendingAction(null);
    }
  }, [postId, pendingAction, sha, applyRequestError]);

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
      toolbarPlugin({ toolbarContents: () => <EditorToolbar editorRef={editorRef} /> }),
    ],
    [],
  );

  if (loadStatus === 'loading') {
    return <EditorLoadingSkeleton />;
  }

  if (loadStatus === 'error') {
    return (
      <div className="mx-auto flex max-w-prose flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <p className="text-sm font-medium text-foreground">Could not load this post.</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPost()}>
            <RefreshCwIcon />
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="/dashboard/posts">Back to posts</a>
          </Button>
        </div>
      </div>
    );
  }

  const isBusy = pendingAction !== null;
  const effectiveSlug = (form.slug || toSlug(form.title)).trim();
  const isTitleValid = form.title.trim().length >= TITLE_MIN_LENGTH;
  const isTitleOver = form.title.length > TITLE_MAX_LENGTH;

  return (
    <div className="flex flex-col gap-5" aria-busy={isBusy}>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="whitespace-nowrap">
          <a href="/dashboard/posts">
            <ArrowLeftIcon />
            Posts
          </a>
        </Button>

        <Badge variant={form.status === 'published' ? 'default' : 'secondary'}>
          {STATUS_LABELS[form.status]}
        </Badge>

        {isDirty ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Unsaved changes
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            All changes saved
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void persist('draft')}
            disabled={isBusy}
            className="whitespace-nowrap"
          >
            {pendingAction === 'save' ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Save draft
          </Button>
          <Button
            type="button"
            onClick={() => void persist('published')}
            disabled={isBusy}
            className="whitespace-nowrap"
          >
            {pendingAction === 'publish' ? <Loader2Icon className="animate-spin" /> : <GlobeIcon />}
            Publish
          </Button>
          {postId && form.status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleUnpublish()}
              disabled={isBusy}
              className="whitespace-nowrap"
            >
              {pendingAction === 'unpublish' ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <EyeOffIcon />
              )}
              Unpublish
            </Button>
          ) : null}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="post-title">Title</Label>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  isTitleOver || (form.title.length > 0 && !isTitleValid)
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {form.title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <Input
              id="post-title"
              value={form.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              disabled={isBusy}
              maxLength={TITLE_MAX_LENGTH * 2}
              autoComplete="off"
              placeholder="A clear, specific headline"
              className="h-11 text-lg font-medium"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'post-title-error' : 'post-title-hint'}
            />
            <p id="post-title-hint" className="text-xs text-muted-foreground">
              Between {TITLE_MIN_LENGTH} and {TITLE_MAX_LENGTH} characters.
            </p>
            {fieldErrors.title ? (
              <p id="post-title-error" className="text-sm text-destructive">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <MDXEditor
              ref={editorRef}
              markdown={body}
              onChange={handleBodyChange}
              plugins={plugins}
              placeholder="Write the post in Markdown. Use the toolbar to add structure, links, images, and tables."
              className="font-sans"
              contentEditableClassName="prose max-w-none min-h-[28rem] px-5 py-5 focus:outline-none dark:prose-invert"
            />
          </div>

          <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-base font-bold tracking-[-0.02em] text-foreground">
              Organize
            </h2>
            <CategorySelect
              value={form.category}
              onChange={(category) => handleFrontmatterChange({ category })}
              disabled={isBusy}
            />
            <TagInput
              values={form.tags}
              onChange={(tags) => handleFrontmatterChange({ tags })}
              disabled={isBusy}
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.affiliate}
                onChange={(event) => handleFrontmatterChange({ affiliate: event.target.checked })}
                disabled={isBusy}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              This post contains affiliate links
            </label>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          <SeoPanel
            frontmatter={{
              title: form.title,
              description: form.description,
              seoTitle: form.seoTitle,
              slug: form.slug,
              coverUrl: form.coverUrl,
              coverAlt: form.coverAlt,
              canonical: form.canonical,
              focusKeyword: form.focusKeyword,
              noindex: form.noindex,
              pubDate: form.pubDate,
            }}
            body={body}
            origin={origin}
            disabled={isBusy}
            effectiveSlug={effectiveSlug}
            descriptionError={fieldErrors.description}
            slugError={fieldErrors.slug}
            coverAction={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="whitespace-nowrap"
                disabled={isBusy}
                onClick={() => setIsCoverPickerOpen(true)}
              >
                <ImagesIcon />
                Choose from library
              </Button>
            }
            onChange={handleSeoChange}
          />
          <p className="text-xs text-muted-foreground">
            A future publish date keeps this post as a scheduled draft until that moment.
          </p>
        </aside>
      </div>

      <MediaPicker
        open={isCoverPickerOpen}
        onOpenChange={setIsCoverPickerOpen}
        onSelect={handleCoverSelect}
      />
    </div>
  );
}
