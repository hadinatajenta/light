import {
  GlobeIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';

const SETTINGS_ENDPOINT = '/api/dashboard/site-settings';
const DESCRIPTION_MAX_LENGTH = 200;
const TAGLINE_MAX_LENGTH = 200;

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

interface SiteSettings {
  title: string;
  description: string;
  tagline: string;
  author: string;
  locale: string;
  defaultOgImage: string;
  googleSiteVerification: string;
  twitterHandle: string;
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export default function SiteSettingsForm() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [defaults, setDefaults] = useState<SiteSettings | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<{ settings: SiteSettings; defaults: SiteSettings }>(
        SETTINGS_ENDPOINT,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setSettings(payload.settings);
      setDefaults(payload.defaults);
      setFieldErrors({});
      setFormError(null);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    return () => controllerRef.current?.abort();
  }, [loadSettings]);

  const update = (patch: Partial<SiteSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  };

  const handleReset = () => {
    if (!defaults) {
      return;
    }
    setSettings(defaults);
    setFieldErrors({});
    setFormError(null);
    toast.success('Restored the default site identity.');
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || settings === null) {
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const payload = await requestJson<{ settings: SiteSettings }>(SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(payload.settings);
      toast.success('Site settings saved.');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(mapFieldErrors(error.details));
      }
      const message = toErrorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <span className="sr-only">Loading site settings</span>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-9 w-1/2" />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (status === 'error' || settings === null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load site settings</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isSaving}
    >
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Site identity</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            These values become the defaults for every page head. A page that sets its own title or
            description still wins.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-title">Title</Label>
          <Input
            id="settings-title"
            value={settings.title}
            maxLength={60}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? 'settings-title-error' : undefined}
            onChange={(event) => update({ title: event.target.value })}
          />
          <FieldError id="settings-title-error" message={fieldErrors.title} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="settings-description">Description</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {settings.description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="settings-description"
            rows={3}
            className={TEXTAREA_CLASS}
            value={settings.description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={
              fieldErrors.description ? 'settings-description-error' : 'settings-description-help'
            }
            onChange={(event) => update({ description: event.target.value })}
          />
          {fieldErrors.description ? (
            <p id="settings-description-error" className="text-sm text-destructive">
              {fieldErrors.description}
            </p>
          ) : (
            <p id="settings-description-help" className="text-xs text-muted-foreground">
              The search-result snippet. Aim for a clear 20 to 200 characters.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="settings-tagline">Tagline</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {settings.tagline.length}/{TAGLINE_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="settings-tagline"
            rows={2}
            className={TEXTAREA_CLASS}
            value={settings.tagline}
            maxLength={TAGLINE_MAX_LENGTH}
            aria-invalid={Boolean(fieldErrors.tagline)}
            aria-describedby={fieldErrors.tagline ? 'settings-tagline-error' : undefined}
            onChange={(event) => update({ tagline: event.target.value })}
          />
          <FieldError id="settings-tagline-error" message={fieldErrors.tagline} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-author">Author</Label>
            <Input
              id="settings-author"
              value={settings.author}
              maxLength={60}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.author)}
              aria-describedby={fieldErrors.author ? 'settings-author-error' : undefined}
              onChange={(event) => update({ author: event.target.value })}
            />
            <FieldError id="settings-author-error" message={fieldErrors.author} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-locale">Locale</Label>
            <Input
              id="settings-locale"
              className="font-mono"
              value={settings.locale}
              maxLength={5}
              autoComplete="off"
              spellCheck={false}
              placeholder="en-US"
              aria-invalid={Boolean(fieldErrors.locale)}
              aria-describedby={fieldErrors.locale ? 'settings-locale-error' : undefined}
              onChange={(event) => update({ locale: event.target.value })}
            />
            <FieldError id="settings-locale-error" message={fieldErrors.locale} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-og-image">Default social image</Label>
          <Input
            id="settings-og-image"
            className="font-mono"
            value={settings.defaultOgImage}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            placeholder="/og-default.png"
            aria-invalid={Boolean(fieldErrors.defaultOgImage)}
            aria-describedby={
              fieldErrors.defaultOgImage ? 'settings-og-image-error' : 'settings-og-image-help'
            }
            onChange={(event) => update({ defaultOgImage: event.target.value })}
          />
          {fieldErrors.defaultOgImage ? (
            <p id="settings-og-image-error" className="text-sm text-destructive">
              {fieldErrors.defaultOgImage}
            </p>
          ) : (
            <p id="settings-og-image-help" className="text-xs text-muted-foreground">
              An absolute path like /og-default.png or a full https URL.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-google">Google site verification</Label>
            <Input
              id="settings-google"
              className="font-mono"
              value={settings.googleSiteVerification}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(fieldErrors.googleSiteVerification)}
              aria-describedby={
                fieldErrors.googleSiteVerification
                  ? 'settings-google-error'
                  : 'settings-google-help'
              }
              onChange={(event) => update({ googleSiteVerification: event.target.value })}
            />
            {fieldErrors.googleSiteVerification ? (
              <p id="settings-google-error" className="text-sm text-destructive">
                {fieldErrors.googleSiteVerification}
              </p>
            ) : (
              <p id="settings-google-help" className="text-xs text-muted-foreground">
                Leave empty to omit the verification tag.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-twitter">Twitter handle</Label>
            <Input
              id="settings-twitter"
              className="font-mono"
              value={settings.twitterHandle}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              placeholder="@lightscripts"
              aria-invalid={Boolean(fieldErrors.twitterHandle)}
              aria-describedby={fieldErrors.twitterHandle ? 'settings-twitter-error' : undefined}
              onChange={(event) => update({ twitterHandle: event.target.value })}
            />
            <FieldError id="settings-twitter-error" message={fieldErrors.twitterHandle} />
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={handleReset}>
            <RotateCcwIcon />
            Reset to defaults
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {isSaving ? 'Saving' : 'Save changes'}
          </Button>
        </div>
      </div>

      <aside className="flex flex-col gap-4 self-start rounded-xl border border-border bg-card p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-2">
          <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Preview</h3>
        </div>

        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
            Browser tab
          </p>
          <p className="mt-1 truncate text-sm text-foreground" title={settings.title}>
            {settings.title}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
            Search result
          </p>
          <p className="mt-2 truncate text-sm text-primary">{settings.title}</p>
          <p className="truncate text-xs text-muted-foreground">lightscripts.com</p>
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{settings.description}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Changes apply immediately, because the site reads this from the database on every render.
          Resetting restores the values that ship with the site (from src/consts.ts)
          {defaults ? (
            <>
              : title <span className="text-foreground">{defaults.title}</span>, description{' '}
              <span className="text-foreground">"{defaults.description}"</span>.
            </>
          ) : (
            '.'
          )}
        </p>
      </aside>
    </form>
  );
}
