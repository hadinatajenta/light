import {
  CheckCircle2Icon,
  KeyRoundIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ModelProviderId } from '@/lib/agents/model-providers';
import type { SecretStatus } from '@/lib/agents/settings';
import { requestJson, toErrorMessage } from './api-client';

const MODEL_PROVIDER_ENDPOINT = '/api/dashboard/settings/model-provider';

interface ModelProviderSummary {
  id: ModelProviderId;
  label: string;
  billing: string;
  keyUrl: string;
  models: string[];
}

interface ModelProviderKeysView {
  providers: ModelProviderSummary[];
  keys: Record<ModelProviderId, SecretStatus>;
}

interface SavedProviderKey {
  configured: boolean;
  hint: string | null;
}

function ProviderKeyRow({
  provider,
  providerKey,
}: {
  provider: ModelProviderSummary;
  providerKey: SecretStatus | undefined;
}) {
  const isConfigured = providerKey?.configured === true;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-foreground">{provider.label}</span>
        {isConfigured ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Configured
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not configured</span>
        )}
      </div>
      <p className="max-w-prose text-xs text-muted-foreground">
        {provider.billing} <span className="tabular-nums">{provider.models.length}</span>{' '}
        {provider.models.length === 1 ? 'model' : 'models'} available.{' '}
        <a
          href={provider.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap text-foreground underline underline-offset-4"
        >
          Create a {provider.label} key
        </a>
      </p>
      {providerKey?.hint ? (
        <p className="text-xs text-muted-foreground">
          Saved key:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {providerKey.hint}
          </code>
        </p>
      ) : null}
    </li>
  );
}

export default function ModelProviderKeyCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ModelProviderSummary[]>([]);
  const [keys, setKeys] = useState<Partial<Record<ModelProviderId, SecretStatus>>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<ModelProviderId | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<ModelProviderKeysView>(MODEL_PROVIDER_ENDPOINT, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setProviders(payload.providers);
      setKeys(payload.keys);
      setSelectedProviderId((current) => {
        if (current && payload.keys[current]) {
          return current;
        }
        const firstMissing = payload.providers.find(
          (provider) => !payload.keys[provider.id]?.configured,
        );
        return (firstMissing ?? payload.providers[0])?.id ?? '';
      });
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

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const isReplacing = selectedProvider ? keys[selectedProvider.id]?.configured === true : false;

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSaving || !selectedProvider) {
      return;
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      setSaveError(`Enter the ${selectedProvider.label} API key before saving.`);
      return;
    }

    const providerId = selectedProvider.id;
    const providerLabel = selectedProvider.label;
    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = await requestJson<SavedProviderKey>(MODEL_PROVIDER_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ provider: providerId, apiKey: trimmedKey }),
      });

      setKeys((current) => ({
        ...current,
        [providerId]: { configured: payload.configured, hint: payload.hint },
      }));
      setApiKey('');
      toast.success(`${providerLabel} API key saved.`);
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
        aria-label="Model provider keys"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading the model provider keys</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Model provider keys"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <KeyRoundIcon className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load the model provider keys
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => void loadSettings()}
        >
          <RefreshCwIcon aria-hidden="true" />
          Retry
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label="Model provider keys"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Model provider keys</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Agents call a model provider to draft and review content. Add a key for the provider an
            agent should use before you run it.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {providers.map((provider) => (
          <ProviderKeyRow key={provider.id} provider={provider} providerKey={keys[provider.id]} />
        ))}
      </ul>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="model-provider">Provider</Label>
          <Select
            id="model-provider"
            value={selectedProviderId}
            onChange={(event) => {
              setSaveError(null);
              setSelectedProviderId(event.target.value as ModelProviderId);
            }}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="model-provider-api-key">
            {selectedProvider ? `${selectedProvider.label} API key` : 'API key'}
          </Label>
          <Input
            id="model-provider-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:max-w-sm"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            aria-invalid={saveError !== null}
            aria-describedby={
              saveError ? 'model-provider-api-key-error' : 'model-provider-api-key-help'
            }
            placeholder="Paste the provider key"
          />
          {saveError ? (
            <p id="model-provider-api-key-error" role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          ) : (
            <p id="model-provider-api-key-help" className="text-xs text-muted-foreground">
              Stored encrypted and never shown again in full.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
            {isSaving ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <SaveIcon aria-hidden="true" />
            )}
            {isSaving ? 'Saving' : isReplacing ? 'Replace key' : 'Save key'}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
            The key is checked against the provider before it is stored
          </span>
        </div>
      </form>
    </section>
  );
}
