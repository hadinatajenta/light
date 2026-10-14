import { Loader2Icon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AnalystCredentialDescriptions,
  AnalystGoogleSource,
} from '@/lib/agents/analyst/credentials';
import type { AnalystCredentialTestResult } from '@/lib/agents/analyst/sources';
import type { AnalystSourceView } from '@/lib/dashboard/analyst';
import AffiliateReportImport from './affiliate-report-import';
import { requestJson, toErrorMessage } from './api-client';
import GoogleCredentialBlock from './google-credential-block';

const PERFORMANCE_ENDPOINT = '/api/dashboard/settings/performance';
const TEST_ENDPOINT = `${PERFORMANCE_ENDPOINT}/test`;

interface PerformanceSettingsView {
  credentials: AnalystCredentialDescriptions;
  sources: AnalystSourceView[];
}

interface CredentialTestResults {
  gsc: AnalystCredentialTestResult;
  ga4: AnalystCredentialTestResult;
}

export default function PerformanceCredentialsCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AnalystCredentialDescriptions | null>(null);
  const [tests, setTests] = useState<CredentialTestResults | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<PerformanceSettingsView>(PERFORMANCE_ENDPOINT, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setCredentials(payload.credentials);
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

  const saveCredentials = useCallback(
    async (source: AnalystGoogleSource, body: Record<string, string>) => {
      const payload = await requestJson<{ credentials: AnalystCredentialDescriptions }>(
        PERFORMANCE_ENDPOINT,
        {
          method: 'PUT',
          body: JSON.stringify({ [source]: body }),
        },
      );

      setCredentials(payload.credentials);
      setTests((current) => (current ? { ...current, [source]: null } : current));
    },
    [],
  );

  const runTests = useCallback(async () => {
    if (isTesting) {
      return;
    }

    setIsTesting(true);
    setTestError(null);

    try {
      const payload = await requestJson<CredentialTestResults>(TEST_ENDPOINT, { method: 'POST' });
      setTests(payload);
    } catch (error) {
      setTestError(toErrorMessage(error));
    } finally {
      setIsTesting(false);
    }
  }, [isTesting]);

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">Loading the performance data sources</span>
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (status === 'error' || credentials === null) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
        <ShieldAlertIcon className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load the performance data sources
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
    <div className="flex flex-col gap-6">
      {testError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {testError}
        </p>
      ) : null}

      <GoogleCredentialBlock
        source="gsc"
        description={credentials.gsc}
        test={tests?.gsc ?? null}
        isTestPending={isTesting}
        onTest={() => void runTests()}
        onSave={saveCredentials}
      />

      <GoogleCredentialBlock
        source="ga4"
        description={credentials.ga4}
        test={tests?.ga4 ?? null}
        isTestPending={isTesting}
        onTest={() => void runTests()}
        onSave={saveCredentials}
      />

      <AffiliateReportImport />

      <section
        aria-labelledby="performance-source-status-heading"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div>
          <h3
            id="performance-source-status-heading"
            className="text-sm font-medium text-foreground"
          >
            Data source status
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            What the analyst could read the last time it ran. A source that is not connected is
            never read as zero, so the rules that need it stay dormant instead of writing a wrong
            finding.
          </p>
        </div>

        <p className="max-w-prose text-sm text-muted-foreground">
          The same five sources are listed under the schedule, with the action to take for each.
        </p>

        {isTesting ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            Testing the stored Google credentials.
          </p>
        ) : null}
      </section>
    </div>
  );
}
