import {
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { NOTIFICATION_PUSH_EVENTS } from '@/lib/notifications/rules';
import type { NotificationSettingsView } from '@/lib/notifications/settings';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { NOTIFICATION_EVENT_LABELS } from './notification-presentation';

const SETTINGS_ENDPOINT = '/api/dashboard/settings/notifications';
const TEST_ENDPOINT = '/api/dashboard/settings/notifications/test';

interface NotificationSettingsForm {
  dashboardUrl: string;
  emailEnabled: boolean;
  emailRecipient: string;
  emailSender: string;
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramBotToken: string;
  events: Record<string, boolean>;
}

const EMPTY_FORM: NotificationSettingsForm = {
  dashboardUrl: '',
  emailEnabled: false,
  emailRecipient: '',
  emailSender: '',
  telegramEnabled: false,
  telegramChatId: '',
  telegramBotToken: '',
  events: {},
};

function toForm(view: NotificationSettingsView): NotificationSettingsForm {
  return {
    dashboardUrl: view.dashboardUrl,
    emailEnabled: view.email.enabled,
    emailRecipient: view.email.recipient,
    emailSender: view.email.sender,
    telegramEnabled: view.telegram.enabled,
    telegramChatId: view.telegram.chatId,
    telegramBotToken: '',
    events: view.events,
  };
}

function toFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) {
    return {};
  }

  const details = error.details as
    | { issues?: Array<{ field?: string; message?: string }> }
    | undefined;

  const fieldErrors: Record<string, string> = {};

  for (const issue of details?.issues ?? []) {
    if (typeof issue.field === 'string' && typeof issue.message === 'string') {
      fieldErrors[issue.field] = issue.message;
    }
  }

  return fieldErrors;
}

export default function NotificationSettings() {
  const [form, setForm] = useState<NotificationSettingsForm>(EMPTY_FORM);
  const [botTokenHint, setBotTokenHint] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const view = await requestJson<NotificationSettingsView>(SETTINGS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setForm(toForm(view));
      setBotTokenHint(view.telegram.botTokenHint);
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

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const view = await requestJson<NotificationSettingsView>(SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({
          dashboardUrl: form.dashboardUrl.trim(),
          email: {
            enabled: form.emailEnabled,
            recipient: form.emailRecipient.trim(),
            sender: form.emailSender.trim(),
          },
          telegram: {
            enabled: form.telegramEnabled,
            chatId: form.telegramChatId.trim(),
            ...(form.telegramBotToken.trim() ? { botToken: form.telegramBotToken.trim() } : {}),
          },
          events: form.events,
        }),
      });
      setForm(toForm(view));
      setBotTokenHint(view.telegram.botTokenHint);
      toast.success('Notification settings saved.');
    } catch (error) {
      const errors = toFieldErrors(error);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setFormError(toErrorMessage(error));
      }
      toast.error(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (isTesting) {
      return;
    }

    setIsTesting(true);

    try {
      const payload = await requestJson<{ channel: string | null }>(TEST_ENDPOINT, {
        method: 'POST',
      });
      toast.success(`Test notification sent via ${payload.channel ?? 'the configured channel'}.`);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsTesting(false);
    }
  };

  if (status === 'loading') {
    return (
      <section
        aria-label="Notification settings"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading notification settings</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Notification settings"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <MailIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load the notification settings
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
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isSaving}
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <MailIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Delivery channels</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Email is sent through Cloudflare Email Routing and is free for verified destination
            addresses. Telegram is free and unlimited. Both stay off until you enable them.
          </p>
        </div>
      </div>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Email
        </legend>

        <div className="flex items-center gap-3">
          <input
            id="notification-email-enabled"
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={form.emailEnabled}
            onChange={(event) =>
              setForm((current) => ({ ...current, emailEnabled: event.target.checked }))
            }
          />
          <Label htmlFor="notification-email-enabled">Send important notifications by email</Label>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notification-email-recipient">Recipient address</Label>
          <Input
            id="notification-email-recipient"
            type="email"
            autoComplete="email"
            className="sm:max-w-sm"
            value={form.emailRecipient}
            onChange={(event) =>
              setForm((current) => ({ ...current, emailRecipient: event.target.value }))
            }
            aria-invalid={fieldErrors['email.recipient'] !== undefined}
            aria-describedby="notification-email-recipient-help"
            placeholder="you@example.com"
          />
          <p id="notification-email-recipient-help" className="text-xs text-muted-foreground">
            Must be a verified destination address in your Cloudflare Email Routing account.
          </p>
          {fieldErrors['email.recipient'] ? (
            <p className="text-sm text-destructive">{fieldErrors['email.recipient']}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notification-email-sender">Sender address</Label>
          <Input
            id="notification-email-sender"
            type="email"
            autoComplete="off"
            className="sm:max-w-sm"
            value={form.emailSender}
            onChange={(event) =>
              setForm((current) => ({ ...current, emailSender: event.target.value }))
            }
            aria-invalid={fieldErrors['email.sender'] !== undefined}
            aria-describedby="notification-email-sender-help"
          />
          <p id="notification-email-sender-help" className="text-xs text-muted-foreground">
            Must use a domain with Email Routing enabled in this Cloudflare account.
          </p>
          {fieldErrors['email.sender'] ? (
            <p className="text-sm text-destructive">{fieldErrors['email.sender']}</p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Telegram
        </legend>

        <div className="flex items-center gap-3">
          <input
            id="notification-telegram-enabled"
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={form.telegramEnabled}
            onChange={(event) =>
              setForm((current) => ({ ...current, telegramEnabled: event.target.checked }))
            }
          />
          <Label htmlFor="notification-telegram-enabled">
            Send important notifications to Telegram
          </Label>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notification-telegram-chat-id">Chat id</Label>
          <Input
            id="notification-telegram-chat-id"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:max-w-sm"
            value={form.telegramChatId}
            onChange={(event) =>
              setForm((current) => ({ ...current, telegramChatId: event.target.value }))
            }
            aria-invalid={fieldErrors['telegram.chatId'] !== undefined}
            placeholder="123456789"
          />
          {fieldErrors['telegram.chatId'] ? (
            <p className="text-sm text-destructive">{fieldErrors['telegram.chatId']}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notification-telegram-token">Bot token</Label>
          <Input
            id="notification-telegram-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:max-w-sm"
            value={form.telegramBotToken}
            onChange={(event) =>
              setForm((current) => ({ ...current, telegramBotToken: event.target.value }))
            }
            aria-invalid={fieldErrors['telegram.botToken'] !== undefined}
            aria-describedby="notification-telegram-token-help"
            placeholder={botTokenHint ?? '123456:ABC-DEF...'}
          />
          <p
            id="notification-telegram-token-help"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
            {botTokenHint
              ? 'A token is saved. Leave this empty to keep it.'
              : 'Create a bot with @BotFather, then paste the token here.'}
          </p>
          {fieldErrors['telegram.botToken'] ? (
            <p className="text-sm text-destructive">{fieldErrors['telegram.botToken']}</p>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notification-dashboard-url">Dashboard URL</Label>
        <Input
          id="notification-dashboard-url"
          type="url"
          autoComplete="off"
          spellCheck={false}
          className="sm:max-w-sm"
          value={form.dashboardUrl}
          onChange={(event) =>
            setForm((current) => ({ ...current, dashboardUrl: event.target.value }))
          }
          aria-invalid={fieldErrors.dashboardUrl !== undefined}
          aria-describedby="notification-dashboard-url-help"
        />
        <p id="notification-dashboard-url-help" className="text-xs text-muted-foreground">
          Used to build the links inside email and Telegram messages. Set it to the host that
          actually serves the dashboard.
        </p>
        {fieldErrors.dashboardUrl ? (
          <p className="text-sm text-destructive">{fieldErrors.dashboardUrl}</p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Push these events
        </legend>
        <p className="max-w-prose text-xs text-muted-foreground">
          Everything is always recorded in the dashboard. These switches control what leaves the
          system.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {NOTIFICATION_PUSH_EVENTS.map((event) => {
            const isEnabled = form.events[event] !== false;

            return (
              <li key={event}>
                <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={isEnabled}
                    onChange={(inputEvent) =>
                      setForm((current) => ({
                        ...current,
                        events: { ...current.events, [event]: inputEvent.target.checked },
                      }))
                    }
                  />
                  <span className="min-w-0">{NOTIFICATION_EVENT_LABELS[event]}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isSaving} className="whitespace-nowrap">
          {isSaving ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon aria-hidden="true" />
          )}
          {isSaving ? 'Saving' : 'Save settings'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isTesting}
          className="whitespace-nowrap"
          onClick={() => void handleTest()}
        >
          {isTesting ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <SendIcon aria-hidden="true" />
          )}
          {isTesting ? 'Sending' : 'Send test'}
        </Button>
      </div>
    </form>
  );
}
