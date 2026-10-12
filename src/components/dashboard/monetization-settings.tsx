import {
  BarChart3Icon,
  CircleAlertIcon,
  Loader2Icon,
  MegaphoneIcon,
  RefreshCwIcon,
  SaveIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import type { MonetizationReport } from './program-manager';
import { mapFieldErrors } from './program-manager';

const SETTINGS_ENDPOINT = '/api/dashboard/monetization/settings';
const REPORT_ENDPOINT = '/api/dashboard/monetization/report';
const DISCLOSURE_MAX_LENGTH = 2000;
const CLIENT_ID_MAX_LENGTH = 120;
const SLOT_MAX_LENGTH = 80;
const ADS_TXT_MAX_LENGTH = 20_000;
const SLOT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_VALUE_PATTERN = /^[A-Za-z0-9_-]*$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]*$/;
const AD_NETWORKS_PLACEHOLDER = 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0';

const AD_NETWORKS: { value: AdNetwork; label: string }[] = [
  { value: 'none', label: 'No ads' },
  { value: 'adsense', label: 'Google AdSense' },
  { value: 'ezoic', label: 'Ezoic' },
  { value: 'mediavine', label: 'Mediavine' },
];

const SLOT_KEYS = ['in-article-top', 'in-article-mid', 'in-article-bottom'];
const SLOT_LABELS: Record<string, string> = {
  'in-article-top': 'In-article top',
  'in-article-mid': 'In-article middle',
  'in-article-bottom': 'In-article bottom',
};

type AdNetwork = 'none' | 'adsense' | 'ezoic' | 'mediavine';
type CardId = 'ads' | 'disclosure';

interface AdSettings {
  network: AdNetwork;
  adsenseClientId: string | null;
  slots: Record<string, string>;
  adsTxt: string;
}

interface MonetizationSettingsPayload {
  ads: AdSettings;
  disclosure: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

function SettingsCard({
  title,
  description,
  icon,
  children,
  actions,
  error,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
  error?: string | null;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {children}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </section>
  );
}

function SaveButton({
  isSaving,
  isDisabled,
  label,
  onClick,
}: {
  isSaving: boolean;
  isDisabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      className="whitespace-nowrap"
      disabled={isSaving || isDisabled}
      onClick={onClick}
    >
      {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
      {isSaving ? 'Saving' : label}
    </Button>
  );
}

export default function MonetizationSettings() {
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<MonetizationSettingsPayload | null>(null);
  const [adsErrors, setAdsErrors] = React.useState<Record<string, string>>({});
  const [disclosureError, setDisclosureError] = React.useState<string | null>(null);
  const [savingCard, setSavingCard] = React.useState<CardId | null>(null);
  const [report, setReport] = React.useState<MonetizationReport | null>(null);
  const [reportStatus, setReportStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const settingsAbortRef = React.useRef<AbortController | null>(null);
  const reportAbortRef = React.useRef<AbortController | null>(null);
  const mutationAbortRef = React.useRef<AbortController | null>(null);

  const loadSettings = React.useCallback(async () => {
    settingsAbortRef.current?.abort();
    const controller = new AbortController();
    settingsAbortRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<MonetizationSettingsPayload>(SETTINGS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setSettings(payload);
      setAdsErrors({});
      setDisclosureError(null);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  const loadReport = React.useCallback(async () => {
    reportAbortRef.current?.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;
    setReportStatus('loading');

    try {
      const payload = await requestJson<MonetizationReport>(REPORT_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setReport(payload);
      setReportStatus('ready');
    } catch {
      if (!controller.signal.aborted) {
        setReportStatus('error');
      }
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
    return () => settingsAbortRef.current?.abort();
  }, [loadSettings]);

  React.useEffect(() => {
    void loadReport();
    return () => reportAbortRef.current?.abort();
  }, [loadReport]);

  React.useEffect(() => {
    return () => mutationAbortRef.current?.abort();
  }, []);

  const isSaving = savingCard !== null;

  const updateAds = (patch: Partial<AdSettings>) => {
    setSettings((current) =>
      current ? { ...current, ads: { ...current.ads, ...patch } } : current,
    );
  };

  const updateSlot = (key: string, value: string) => {
    setSettings((current) =>
      current
        ? { ...current, ads: { ...current.ads, slots: { ...current.ads.slots, [key]: value } } }
        : current,
    );
  };

  const handleSave = async (card: CardId) => {
    if (isSaving || settings === null) {
      return;
    }

    const localErrors: Record<string, string> = {};
    if (card === 'ads') {
      const clientId = settings.ads.adsenseClientId ?? '';
      if (clientId.length > CLIENT_ID_MAX_LENGTH) {
        localErrors.adsenseClientId = `Client id must be ${CLIENT_ID_MAX_LENGTH} characters or fewer.`;
      } else if (clientId.length > 0 && !CLIENT_ID_PATTERN.test(clientId)) {
        localErrors.adsenseClientId = 'Use letters, numbers, dots, hyphens, or underscores.';
      }
      for (const [key, value] of Object.entries(settings.ads.slots)) {
        if (!SLOT_KEY_PATTERN.test(key)) {
          localErrors[key] = 'Use lowercase letters, numbers, and hyphens for the slot name.';
        } else if (value.length > SLOT_MAX_LENGTH) {
          localErrors[key] = `Slot id must be ${SLOT_MAX_LENGTH} characters or fewer.`;
        } else if (!SLOT_VALUE_PATTERN.test(value)) {
          localErrors[key] = 'Use letters, numbers, hyphens, or underscores for the slot id.';
        }
      }
      if (Object.keys(localErrors).length > 0) {
        setAdsErrors(localErrors);
        return;
      }
    } else if (settings.disclosure.length > DISCLOSURE_MAX_LENGTH) {
      setDisclosureError(`Disclosure must be ${DISCLOSURE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    if (card === 'ads') {
      setAdsErrors({});
    } else {
      setDisclosureError(null);
    }
    setSavingCard(card);

    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;

    try {
      const payload = await requestJson<MonetizationSettingsPayload>(SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ ads: settings.ads, disclosure: settings.disclosure }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setSettings(payload);
      toast.success(card === 'ads' ? 'Ad settings saved.' : 'Disclosure saved.');
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      const mapped = error instanceof ApiRequestError ? mapFieldErrors(error.details) : {};
      const message = toErrorMessage(error);
      toast.error(message);
      if (card === 'ads') {
        setAdsErrors(Object.keys(mapped).length > 0 ? mapped : { form: message });
      } else {
        setDisclosureError(
          Object.keys(mapped).length > 0 ? (Object.values(mapped)[0] ?? null) : message,
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setSavingCard(null);
      }
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-live="polite">
        <span className="sr-only">Loading monetization settings</span>
        {['ads-skeleton', 'disclosure-skeleton', 'report-skeleton'].map((key) => (
          <div
            key={key}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error' || settings === null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load monetization settings
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </div>
    );
  }

  const adsenseClientIdError = adsErrors.adsenseClientId;
  const isAdsense = settings.ads.network === 'adsense';
  const adsFormError = adsErrors.form ?? null;
  const hasMissingSlots = SLOT_KEYS.every((key) => !(settings.ads.slots[key] ?? '').trim());

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Ads"
        description="Choose the network that serves ads on the site. Slots only render when the network is set and a slot id is filled in."
        icon={<MegaphoneIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
        error={adsFormError}
        actions={
          <SaveButton
            isSaving={savingCard === 'ads'}
            isDisabled={isSaving}
            label="Save ads"
            onClick={() => void handleSave('ads')}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ads-network">Network</Label>
            <Select
              id="ads-network"
              value={settings.ads.network}
              disabled={isSaving}
              onChange={(event) => updateAds({ network: event.target.value as AdNetwork })}
            >
              {AD_NETWORKS.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Setting this to no ads removes every ad slot from the site.
            </p>
          </div>

          {isAdsense ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="ads-client-id">AdSense client id</Label>
              <Input
                id="ads-client-id"
                className="font-mono sm:max-w-sm"
                value={settings.ads.adsenseClientId ?? ''}
                maxLength={CLIENT_ID_MAX_LENGTH}
                autoComplete="off"
                spellCheck={false}
                disabled={isSaving}
                aria-invalid={Boolean(adsenseClientIdError)}
                aria-describedby={
                  adsenseClientIdError ? 'ads-client-id-error' : 'ads-client-id-help'
                }
                placeholder="ca-pub-0000000000000000"
                onChange={(event) => updateAds({ adsenseClientId: event.target.value })}
              />
              {adsenseClientIdError ? (
                <p id="ads-client-id-error" className="text-sm text-destructive">
                  {adsenseClientIdError}
                </p>
              ) : (
                <p id="ads-client-id-help" className="text-xs text-muted-foreground">
                  The publisher id from your AdSense account.
                </p>
              )}
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">Slots</legend>
            {SLOT_KEYS.map((key) => {
              const slotError = adsErrors[key];
              return (
                <div key={key} className="flex flex-col gap-2">
                  <Label htmlFor={`ads-slot-${key}`}>
                    {SLOT_LABELS[key] ?? key}{' '}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {key}
                    </span>
                  </Label>
                  <Input
                    id={`ads-slot-${key}`}
                    className="font-mono sm:max-w-sm"
                    value={settings.ads.slots[key] ?? ''}
                    maxLength={SLOT_MAX_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isSaving}
                    aria-invalid={Boolean(slotError)}
                    aria-describedby={slotError ? `ads-slot-${key}-error` : undefined}
                    placeholder="0000000000"
                    onChange={(event) => updateSlot(key, event.target.value)}
                  />
                  {slotError ? (
                    <p id={`ads-slot-${key}-error`} className="text-sm text-destructive">
                      {slotError}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {hasMissingSlots ? (
              <p className="text-xs text-muted-foreground">
                Empty slots are skipped when a post renders.
              </p>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ads-txt">ads.txt</Label>
            <textarea
              id="ads-txt"
              rows={5}
              className={TEXTAREA_CLASS}
              value={settings.ads.adsTxt}
              maxLength={ADS_TXT_MAX_LENGTH}
              spellCheck={false}
              disabled={isSaving}
              aria-invalid={Boolean(adsErrors.adsTxt)}
              aria-describedby={adsErrors.adsTxt ? 'ads-txt-error' : 'ads-txt-help'}
              placeholder={AD_NETWORKS_PLACEHOLDER}
              onChange={(event) => updateAds({ adsTxt: event.target.value })}
            />
            {adsErrors.adsTxt ? (
              <p id="ads-txt-error" className="text-sm text-destructive">
                {adsErrors.adsTxt}
              </p>
            ) : (
              <p id="ads-txt-help" className="text-xs text-muted-foreground">
                Served verbatim at{' '}
                <a href="/ads.txt" className="text-foreground underline underline-offset-4">
                  /ads.txt
                </a>
                . Networks check this file before they pay for impressions.
              </p>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Disclosure"
        description="The default affiliate disclosure shown on posts that use affiliate links."
        icon={<ScrollTextIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
        error={disclosureError}
        actions={
          <SaveButton
            isSaving={savingCard === 'disclosure'}
            isDisabled={isSaving}
            label="Save disclosure"
            onClick={() => void handleSave('disclosure')}
          />
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="global-disclosure">Disclosure text</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {settings.disclosure.length}/{DISCLOSURE_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="global-disclosure"
            rows={3}
            className={TEXTAREA_CLASS}
            value={settings.disclosure}
            maxLength={DISCLOSURE_MAX_LENGTH}
            disabled={isSaving}
            aria-invalid={Boolean(disclosureError)}
            aria-describedby={
              disclosureError ? 'global-disclosure-error' : 'global-disclosure-help'
            }
            placeholder="This article contains affiliate links."
            onChange={(event) =>
              setSettings((current) =>
                current ? { ...current, disclosure: event.target.value } : current,
              )
            }
          />
          {disclosureError ? (
            <p id="global-disclosure-error" className="text-sm text-destructive">
              {disclosureError}
            </p>
          ) : null}
          <p id="global-disclosure-help" className="text-xs text-muted-foreground">
            Amazon requires its exact sentence:{' '}
            <span className="text-foreground">
              As an Amazon Associate I earn from qualifying purchases.
            </span>{' '}
            A disclosure set on a program wins over this global text for posts that use that
            program.
          </p>
        </div>
      </SettingsCard>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <BarChart3Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">Report</h3>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Clicks are counted when a reader follows an affiliate link.
            </p>
          </div>
        </div>

        {reportStatus === 'loading' ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <span className="sr-only">Loading the click report</span>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        ) : null}

        {reportStatus === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlertIcon className="size-4 shrink-0" />
              The click report could not be loaded.
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadReport()}>
              <RefreshCwIcon />
              Retry
            </Button>
          </div>
        ) : null}

        {reportStatus === 'ready' && report ? (
          <>
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
              <p className="text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                Clicks last 30 days
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {report.clicksLast30Days.toLocaleString('en-US')}
              </p>
            </div>

            {report.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clicks recorded yet. Once a post links to a product and a reader follows it, the
                click shows up here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.topProducts.map((product) => (
                    <TableRow key={product.productId}>
                      <TableCell
                        className="max-w-[18rem] truncate font-medium text-foreground"
                        title={product.name}
                      >
                        {product.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {product.slug}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {product.clicks.toLocaleString('en-US')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
