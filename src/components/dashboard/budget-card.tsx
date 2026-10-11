import { Loader2Icon, RefreshCwIcon, SaveIcon, ShieldAlertIcon, WalletIcon } from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';

const BUDGET_ENDPOINT = '/api/dashboard/settings/budget';

interface BudgetState {
  paused: boolean;
  dailySearches: number;
  monthlySearches: number;
  dailyTokens: number;
  searchUsedToday: number;
  searchUsedThisMonth: number;
  tokensUsedToday: number;
  searchesRemaining: number;
  tokensRemaining: number;
  searchesExhausted: boolean;
  tokensExhausted: boolean;
}

interface BudgetFormValues {
  dailySearches: string;
  monthlySearches: string;
  dailyTokens: string;
}

function toFormValues(state: BudgetState): BudgetFormValues {
  return {
    dailySearches: String(state.dailySearches),
    monthlySearches: String(state.monthlySearches),
    dailyTokens: String(state.dailyTokens),
  };
}

function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function BudgetCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<BudgetState | null>(null);
  const [values, setValues] = useState<BudgetFormValues>({
    dailySearches: '',
    monthlySearches: '',
    dailyTokens: '',
  });
  const [paused, setPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const applyState = useCallback((next: BudgetState) => {
    setState(next);
    setValues(toFormValues(next));
    setPaused(next.paused);
  }, []);

  const loadState = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<BudgetState>(BUDGET_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      applyState(payload);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, [applyState]);

  useEffect(() => {
    void loadState();
    return () => controllerRef.current?.abort();
  }, [loadState]);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const dailySearches = parseCount(values.dailySearches);
    const monthlySearches = parseCount(values.monthlySearches);
    const dailyTokens = parseCount(values.dailyTokens);

    if (dailySearches === null || monthlySearches === null || dailyTokens === null) {
      setSaveError('Enter whole numbers for every limit.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = await requestJson<BudgetState>(BUDGET_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ paused, dailySearches, monthlySearches, dailyTokens }),
      });
      applyState(payload);
      toast.success('Budget saved.');
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
        aria-label="Spending budget"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading spending budget</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error' || !state) {
    return (
      <section
        aria-label="Spending budget"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <ShieldAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the spending budget</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadState()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </section>
    );
  }

  const isBlocked = state.paused || state.searchesExhausted || state.tokensExhausted;

  return (
    <section
      aria-label="Spending budget"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <WalletIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Spending budget</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Caps on Tavily searches and model tokens per day. When a cap is reached, the scrapper
            and agents stop spending instead of charging your card.
          </p>
        </div>
      </div>

      {isBlocked ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.paused
            ? 'Spending is paused. Agents and the scrapper will run without calling any paid service.'
            : state.searchesExhausted
              ? 'The search budget is used up for today. Research resumes when the budget resets.'
              : 'The token budget is used up for today. Agent runs are skipped until it resets.'}
        </p>
      ) : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
            Searches today
          </dt>
          <dd className="mt-1 tabular-nums text-foreground">
            {state.searchUsedToday} / {state.dailySearches}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
            Searches this month
          </dt>
          <dd className="mt-1 tabular-nums text-foreground">
            {state.searchUsedThisMonth} / {state.monthlySearches}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
            Tokens today
          </dt>
          <dd className="mt-1 tabular-nums text-foreground">
            {state.tokensUsedToday.toLocaleString('en-US')} /{' '}
            {state.dailyTokens.toLocaleString('en-US')}
          </dd>
        </div>
      </dl>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-input"
            checked={paused}
            disabled={isSaving}
            onChange={(event) => setPaused(event.target.checked)}
          />
          <span>
            Pause all spending
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Stops every agent run and search until you turn it back on.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-daily-searches">Daily searches</Label>
            <Input
              id="budget-daily-searches"
              inputMode="numeric"
              value={values.dailySearches}
              disabled={isSaving}
              onChange={(event) =>
                setValues((current) => ({ ...current, dailySearches: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-monthly-searches">Monthly searches</Label>
            <Input
              id="budget-monthly-searches"
              inputMode="numeric"
              value={values.monthlySearches}
              disabled={isSaving}
              onChange={(event) =>
                setValues((current) => ({ ...current, monthlySearches: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-daily-tokens">Daily tokens</Label>
            <Input
              id="budget-daily-tokens"
              inputMode="numeric"
              value={values.dailyTokens}
              disabled={isSaving}
              onChange={(event) =>
                setValues((current) => ({ ...current, dailyTokens: event.target.value }))
              }
            />
          </div>
        </div>

        {saveError ? (
          <p role="alert" className={cn('text-sm text-destructive')}>
            {saveError}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {isSaving ? 'Saving' : 'Save budget'}
          </Button>
        </div>
      </form>
    </section>
  );
}
