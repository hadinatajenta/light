import { LinkIcon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon, UnplugIcon } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { requestJson, toErrorMessage } from './api-client';

const AFFILIATE_SETTINGS_ENDPOINT = '/api/dashboard/settings/affiliate';
const SWITCH_ID = 'affiliate-links-enabled';
const STATE_ID = 'affiliate-links-state';
const ANNOUNCEMENT_ID = 'affiliate-links-announcement';

interface AffiliateSettingsPayload {
  enabled: boolean;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export default function AffiliateSettings() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const loadControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  const loadSettings = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<AffiliateSettingsPayload>(AFFILIATE_SETTINGS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setIsEnabled(payload.enabled);
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
    return () => loadControllerRef.current?.abort();
  }, [loadSettings]);

  useEffect(() => () => mutationControllerRef.current?.abort(), []);

  const applyEnabled = async (nextEnabled: boolean) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setAnnouncement('');

    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      const payload = await requestJson<AffiliateSettingsPayload>(AFFILIATE_SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ enabled: nextEnabled }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setIsEnabled(payload.enabled);
      setIsConfirmOpen(false);
      setAnnouncement(
        payload.enabled
          ? 'Affiliate links are now shown on every public page.'
          : 'Affiliate links are now hidden from every public page.',
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setSaveError(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsSaving(false);
      }
    }
  };

  const handleCheckedChange = (nextChecked: boolean) => {
    if (isSaving) {
      return;
    }

    if (nextChecked) {
      void applyEnabled(true);
      return;
    }

    setSaveError(null);
    setIsConfirmOpen(true);
  };

  const closeConfirmation = () => {
    if (isSaving) {
      return;
    }
    setIsConfirmOpen(false);
    setSaveError(null);
  };

  if (status === 'loading') {
    return (
      <section
        aria-label="Affiliate link settings"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading affiliate link settings</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-11 w-14 rounded-full" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Affiliate link settings"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load the affiliate settings
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
      aria-label="Affiliate link settings"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <LinkIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Affiliate links</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The master switch for every affiliate link on the public site.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label
              htmlFor={SWITCH_ID}
              className="min-h-11 cursor-pointer items-center text-sm font-medium text-foreground"
            >
              Show affiliate links on the public site
            </Label>
            <p id={STATE_ID} className="mt-1 max-w-prose text-sm text-muted-foreground">
              {isEnabled
                ? 'Affiliate links are currently shown on every public page.'
                : 'Affiliate links are currently hidden from every public page.'}
            </p>
          </div>
          <SwitchPrimitive.Root
            id={SWITCH_ID}
            checked={isEnabled}
            disabled={isSaving}
            onCheckedChange={handleCheckedChange}
            aria-describedby={STATE_ID}
            className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary"
          >
            <SwitchPrimitive.Thumb className="pointer-events-none block size-6 rounded-full bg-background shadow-sm ring-0 transition-transform duration-150 ease-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
          </SwitchPrimitive.Root>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">When it is off</dt>
            <dd className="mt-0.5 max-w-prose text-muted-foreground">
              No affiliate link, no product block, no rail card, and no affiliate disclosure
              paragraph appears anywhere on the public site. Article text that referred to a product
              stays as ordinary text.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Why it exists</dt>
            <dd className="mt-0.5 max-w-prose text-muted-foreground">
              Google's AdSense content policies reject ad code on pages whose affiliate content
              dominates the rest of the page. Turning this off lets the site run with no affiliate
              link at all while it is being reviewed.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">What it does not do</dt>
            <dd className="mt-0.5 max-w-prose text-muted-foreground">
              It does not delete any product or any reference stored in an article, and it does not
              disable the <span className="font-mono text-xs text-foreground">/go/</span> redirect
              for links already in the wild. Turning it back on restores everything.
            </dd>
          </div>
        </dl>
      </div>

      {saveError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {saveError}
        </p>
      ) : null}

      <p id={ANNOUNCEMENT_ID} aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeConfirmation();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off every affiliate link?</DialogTitle>
            <DialogDescription>
              Every public page stops showing affiliate links, product blocks, rail cards, and the
              affiliate disclosure immediately. Nothing is deleted: the products, the stored article
              text, and the /go/ redirect all stay. You can turn this back on at any time.
            </DialogDescription>
          </DialogHeader>

          {saveError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {saveError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={closeConfirmation}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="whitespace-nowrap"
              disabled={isSaving}
              onClick={() => void applyEnabled(false)}
            >
              {isSaving ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : (
                <UnplugIcon aria-hidden="true" />
              )}
              {saveError ? 'Try again' : 'Turn off affiliate links'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
