import {
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { requestJson, toErrorMessage } from './api-client';

const SEARCH_ENDPOINT = '/api/dashboard/settings/search';

const PROVIDER_OPTIONS = [
  { id: 'tavily', label: 'Tavily', requiresKey: true, help: 'https://tavily.com' },
  { id: 'fixture', label: 'Fixture (development)', requiresKey: false, help: null },
] as const;

type ProviderId = (typeof PROVIDER_OPTIONS)[number]['id'];

interface SearchStatus {
  configured: boolean;
  provider: ProviderId | null;
  hint: string | null;
  allowUnverified: boolean;
}

function providerOption(id: ProviderId | null) {
  return PROVIDER_OPTIONS.find((option) => option.id === id) ?? null;
}

export default function SearchProviderCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>('tavily');
  const [hint, setHint] = useState<string | null>(null);
  const [allowUnverified, setAllowUnverified] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const applyStatus = useCallback((payload: SearchStatus) => {
    setConfigured(payload.configured);
    if (payload.provider) {
      setProviderId(payload.provider);
    }
    setHint(payload.hint);
    setAllowUnverified(payload.allowUnverified);
  }, []);

  const loadStatus = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<SearchStatus>(SEARCH_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      applyStatus(payload);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, [applyStatus]);

  useEffect(() => {
    void loadStatus();
    return () => controllerRef.current?.abort();
  }, [loadStatus]);

  const selected = providerOption(providerId);
  const requiresKey = selected?.requiresKey ?? true;

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const trimmedKey = apiKey.trim();
    if (requiresKey && !configured && trimmedKey.length === 0) {
      setSaveError('Enter the provider API key before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = await requestJson<SearchStatus>(SEARCH_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({
          provider: providerId,
          ...(trimmedKey.length > 0 ? { apiKey: trimmedKey } : {}),
          allowUnverified,
        }),
      });
      applyStatus(payload);
      setApiKey('');
      toast.success('Search provider saved.');
    } catch (error) {
      const message = toErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <section
        aria-label="Search provider"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading search provider status</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Search provider"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the search provider</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadStatus()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label="Search provider"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <SearchCheckIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Search provider</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The scrapper searches the live web and fetches sources before writing notes. Without a
            provider it does nothing rather than guess.
          </p>
        </div>
      </div>

      {!configured ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          The scrapper needs a search provider before it can research a topic.
        </p>
      ) : null}

      {configured && hint ? (
        <p className="text-sm text-muted-foreground">
          Saved key:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {hint}
          </code>
        </p>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-provider">Provider</Label>
          <Select
            id="search-provider"
            value={providerId}
            disabled={isSaving}
            onChange={(event) => setProviderId(event.target.value as ProviderId)}
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          {selected?.help ? (
            <p className="text-xs text-muted-foreground">
              Get a key at{' '}
              <a
                href={selected.help}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                {selected.help}
              </a>
              .
            </p>
          ) : null}
        </div>

        {requiresKey ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="search-api-key">API key</Label>
            <Input
              id="search-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono sm:max-w-sm"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              aria-invalid={saveError !== null}
              aria-describedby={saveError ? 'search-api-key-error' : 'search-api-key-help'}
              placeholder="tvly-..."
            />
            {saveError ? (
              <p id="search-api-key-error" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : (
              <p id="search-api-key-help" className="text-xs text-muted-foreground">
                Stored encrypted and never shown again in full.
              </p>
            )}
          </div>
        ) : null}

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-input"
            checked={allowUnverified}
            disabled={isSaving}
            onChange={(event) => setAllowUnverified(event.target.checked)}
          />
          <span>
            Allow unverified research
            <span className="mt-0.5 block text-xs text-muted-foreground">
              When every source fails, keep notes without a verified quote. The writer then treats
              them as NEEDS RESEARCH and the reviewer will not auto publish from them.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {isSaving ? 'Saving' : 'Save provider'}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            The key is stored encrypted
          </span>
        </div>
      </form>
    </section>
  );
}
