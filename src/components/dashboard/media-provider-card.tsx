import {
  ImageIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { requestJson, toErrorMessage } from './api-client';

const PROVIDERS_ENDPOINT = '/api/dashboard/media/providers';

interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  hint: string | null;
}

interface ProvidersResponse {
  providers: ProviderStatus[];
}

export default function MediaProviderCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadStatus = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<ProvidersResponse>(PROVIDERS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setProviders(payload.providers);
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
    void loadStatus();
    return () => controllerRef.current?.abort();
  }, [loadStatus]);

  const pexels = providers.find((provider) => provider.id === 'pexels') ?? null;
  const fallback = providers.filter((provider) => provider.id !== 'pexels');

  const saveKey = async (value: string | null) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = await requestJson<ProvidersResponse>(PROVIDERS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ pexelsKey: value }),
      });
      setProviders(payload.providers);
      setApiKey('');
      toast.success(value ? 'Pexels key saved.' : 'Pexels key removed.');
    } catch (error) {
      const message = toErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      setSaveError('Enter the Pexels API key before saving.');
      return;
    }

    await saveKey(trimmedKey);
  };

  if (status === 'loading') {
    return (
      <section
        aria-label="Image sources"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading image source status</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Image sources"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the image sources</p>
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
      aria-label="Image sources"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <ImageIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Image sources</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Find images searches Pexels first when a key is set, then falls back to Openverse.
            Pexels returns full resolution photos and permits downloads, while Openverse often
            points at hosts that block automated downloads.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {pexels ? (
          <li className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="font-medium text-foreground">{pexels.label}</span>
            {pexels.configured ? (
              <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs text-foreground">
                Configured
              </span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Not configured
              </span>
            )}
            {pexels.hint ? (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {pexels.hint}
              </code>
            ) : null}
          </li>
        ) : null}
        {fallback.map((provider) => (
          <li
            key={provider.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground">{provider.label}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              Always available
            </span>
          </li>
        ))}
      </ul>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="media-pexels-key">Pexels API key</Label>
          <Input
            id="media-pexels-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:max-w-sm"
            value={apiKey}
            disabled={isSaving}
            onChange={(event) => setApiKey(event.target.value)}
            aria-invalid={saveError !== null}
            aria-describedby={saveError ? 'media-pexels-key-error' : 'media-pexels-key-help'}
            placeholder="563492ad6f9170000..."
          />
          {saveError ? (
            <p id="media-pexels-key-error" className="text-sm text-destructive">
              {saveError}
            </p>
          ) : (
            <p id="media-pexels-key-help" className="text-xs text-muted-foreground">
              Create a free key at{' '}
              <a
                href="https://www.pexels.com/api/"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                pexels.com/api
              </a>
              . The key is stored encrypted and never shown again in full.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {isSaving ? 'Saving' : 'Save key'}
          </Button>
          {pexels?.configured ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => void saveKey(null)}
            >
              <Trash2Icon />
              Remove key
            </Button>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            Downloading a photo counts against your Pexels rate limit
          </span>
        </div>
      </form>
    </section>
  );
}
