import { Loader2Icon, RocketIcon, TriangleAlertIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const ENDPOINT = '/api/dashboard/agents/run-and-publish';
const POLL_MS = 8_000;

export default function PipelineRunButton() {
  const [running, setRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadState = useCallback(async () => {
    try {
      const payload = await requestJson<{ running: boolean }>(ENDPOINT);
      setRunning(payload.running);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => void loadState(), POLL_MS);
    return () => {
      clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [loadState]);

  const handleStart = async () => {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await requestJson<{ started: boolean }>(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setRunning(true);
      setIsConfirmOpen(false);
      toast.success('Run and publish started. Watch progress on the Activity page.');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiRequestError && error.code === 'PIPELINE_BUSY') {
        setRunning(true);
        setIsConfirmOpen(false);
        toast('A run and publish pass is already running.');
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsStarting(false);
      }
    }
  };

  return (
    <>
      <section
        aria-label="Run and publish"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Run &amp; publish
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Runs the enabled agents in order, then publishes only the drafts whose topic has
            verified research. Drafts without verified sources stay in review for a human.
          </p>
        </div>
        <Button
          type="button"
          className="whitespace-nowrap"
          disabled={running || isStarting}
          onClick={() => setIsConfirmOpen(true)}
        >
          {running || isStarting ? <Loader2Icon className="animate-spin" /> : <RocketIcon />}
          {running ? 'Running' : 'Run & publish'}
        </Button>
      </section>

      <DialogPrimitive.Root open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogSurface>
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
              Run and publish now?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              This runs the enabled agents in role order and can publish drafts that pass the
              verified research gate. It may take a few minutes and consume model tokens.
            </DialogPrimitive.Description>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              Publishing is public and immediate. Drafts without verified research are not
              published.
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isStarting}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isStarting} onClick={() => void handleStart()}>
              {isStarting ? <Loader2Icon className="animate-spin" /> : <RocketIcon />}
              {isStarting ? 'Starting' : 'Run & publish'}
            </Button>
          </div>
        </DialogSurface>
      </DialogPrimitive.Root>
    </>
  );
}
