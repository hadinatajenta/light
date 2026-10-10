import { KeyRoundIcon, Loader2Icon, RefreshCwIcon, SaveIcon, ShieldCheckIcon } from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { requestJson, toErrorMessage } from './api-client';

const DEEPSEEK_ENDPOINT = '/api/dashboard/settings/deepseek';
const DEEPSEEK_KEYS_URL = 'https://platform.deepseek.com/';

interface SecretStatus {
  configured: boolean;
  hint: string | null;
}

export default function DeepSeekKeyCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isRevealing, setIsRevealing] = useState(false);
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
      const payload = await requestJson<SecretStatus>(DEEPSEEK_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setConfigured(payload.configured);
      setHint(payload.hint);
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

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length === 0) {
      setSaveError('Enter your DeepSeek API key before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = await requestJson<{ configured: boolean; hint: string }>(DEEPSEEK_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ apiKey: trimmedKey }),
      });
      setConfigured(payload.configured);
      setHint(payload.hint);
      setApiKey('');
      setIsRevealing(false);
      toast.success('DeepSeek API key saved.');
    } catch (error) {
      const message = toErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const showInput = !configured || isRevealing;

  if (status === 'loading') {
    return (
      <section
        aria-label="DeepSeek API key"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading DeepSeek key status</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="DeepSeek API key"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <KeyRoundIcon className="size-6 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the DeepSeek key</p>
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
      aria-label="DeepSeek API key"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">DeepSeek API key</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Agents call DeepSeek to draft and review content. Add a key from the DeepSeek platform
            before you run an agent.{' '}
            <a
              href={DEEPSEEK_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Get a DeepSeek key
            </a>
            .
          </p>
        </div>
      </div>

      {configured && hint ? (
        <p className="text-sm text-muted-foreground">
          Saved key:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {hint}
          </code>
        </p>
      ) : null}

      {configured && !isRevealing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => {
                setSaveError(null);
                setIsRevealing(true);
              }}
            >
              <KeyRoundIcon />
              Replace key
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="size-3.5" />
              Stored encrypted
            </span>
          </div>
        </div>
      ) : null}

      {showInput ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSaving}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="deepseek-api-key">API key</Label>
            <Input
              id="deepseek-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono sm:max-w-sm"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              aria-invalid={saveError !== null}
              aria-describedby={saveError ? 'deepseek-api-key-error' : 'deepseek-api-key-help'}
              placeholder="sk-..."
            />
            {saveError ? (
              <p id="deepseek-api-key-error" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : (
              <p id="deepseek-api-key-help" className="text-xs text-muted-foreground">
                Stored encrypted and never shown again in full.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
              {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              {isSaving ? 'Saving' : 'Save key'}
            </Button>
            {configured ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => {
                  setApiKey('');
                  setSaveError(null);
                  setIsRevealing(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
