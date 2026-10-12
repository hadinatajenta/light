import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Share2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type ChangeEvent,
  type SubmitEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import { mapFieldErrors } from './program-manager';
import { formatAbsoluteTime, formatRelativeTime } from './research-notes';

const SHARING_ENDPOINT = '/api/dashboard/sharing';
const SHARING_SETTINGS_ENDPOINT = '/api/dashboard/sharing/settings';
const SHARING_RUN_ENDPOINT = '/api/dashboard/sharing/run';
const DEFAULT_JOB_LIMIT = 100;
const JOB_LIMIT_OPTIONS = [100, 200, 500];
const LABEL_MAX_LENGTH = 120;
const DAILY_CAP_MAX = 10_000;
const SKELETON_CARDS = ['sharing-skeleton-1', 'sharing-skeleton-2'];

type ShareProvider = 'telegram' | 'discord' | 'mastodon' | 'bluesky' | 'pinterest';
type ShareStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'awaiting_approval' | 'skipped';
type BadgeVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';

interface ShareChannel {
  id: string;
  provider: ShareProvider;
  label: string;
  enabled: boolean;
  config: Record<string, string>;
  secretKeys: string[];
  dailyCap: number | null;
  requireApproval: boolean;
  needsAttention: boolean;
  pausedUntil: string | null;
  startedAt: string | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ShareJob {
  id: string;
  postId: string;
  channelId: string;
  status: ShareStatus;
  attempts: number;
  failures: number;
  rateLimitHits: number;
  nextAttemptAt: string;
  ageResetAt: string | null;
  lockedAt: string | null;
  providerPostId: string | null;
  sharedUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ShareOverview {
  channels: ShareChannel[];
  jobs: ShareJob[];
  paused: boolean;
}

interface ShareTestOutcome {
  outcome: string;
  providerPostId: string | null;
  error: string | null;
}

interface ProviderField {
  key: string;
  label: string;
  kind: 'public' | 'secret';
  placeholder?: string;
}

const PROVIDER_FIELDS: Record<ShareProvider, ProviderField[]> = {
  telegram: [
    { key: 'chatId', label: 'Chat id', kind: 'public', placeholder: '-1001234567890' },
    { key: 'botToken', label: 'Bot token', kind: 'secret', placeholder: '123456:ABC-DEF...' },
  ],
  discord: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      kind: 'secret',
      placeholder: 'https://discord.com/api/webhooks/...',
    },
  ],
  mastodon: [
    {
      key: 'instanceUrl',
      label: 'Instance URL',
      kind: 'public',
      placeholder: 'https://mastodon.social',
    },
    { key: 'accessToken', label: 'Access token', kind: 'secret', placeholder: 'token' },
  ],
  bluesky: [
    { key: 'identifier', label: 'Handle or DID', kind: 'public', placeholder: 'you.bsky.social' },
    {
      key: 'service',
      label: 'Service URL',
      kind: 'public',
      placeholder: 'https://bsky.social',
    },
    {
      key: 'appPassword',
      label: 'App password',
      kind: 'secret',
      placeholder: 'xxxx-xxxx-xxxx-xxxx',
    },
  ],
  pinterest: [
    { key: 'boardId', label: 'Board id', kind: 'public', placeholder: '1234567890' },
    { key: 'accessToken', label: 'Access token', kind: 'secret', placeholder: 'token' },
  ],
};

const PROVIDER_OPTIONS: Array<{ value: ShareProvider; label: string }> = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'mastodon', label: 'Mastodon' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'pinterest', label: 'Pinterest' },
];

const PROVIDER_LABEL = new Map(PROVIDER_OPTIONS.map((option) => [option.value, option.label]));

const STATUS_LABEL: Record<ShareStatus, string> = {
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  awaiting_approval: 'Awaiting approval',
  skipped: 'Skipped',
};

const STATUS_VARIANT: Record<ShareStatus, BadgeVariant> = {
  pending: 'outline',
  sending: 'default',
  sent: 'secondary',
  failed: 'destructive',
  awaiting_approval: 'default',
  skipped: 'ghost',
};

const OUTCOME_LABEL: Record<string, string> = {
  success: 'Delivered',
  channel_config: 'The channel credentials were rejected',
  invalid_payload: 'The provider rejected the message',
  rate_limited: 'The provider rate limited the send',
  transient: 'The provider returned a temporary error',
};

function describeOutcome(outcome: string): string {
  return OUTCOME_LABEL[outcome] || 'The test send failed';
}

function truncateId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function toSafeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface ChannelFormValues {
  label: string;
  provider: ShareProvider;
  enabled: boolean;
  dailyCap: string;
  requireApproval: boolean;
  config: Record<string, string>;
}

type ChannelFormErrors = Record<string, string>;

function validateChannelForm(
  values: ChannelFormValues,
  editingChannel: ShareChannel | null,
): ChannelFormErrors {
  const errors: ChannelFormErrors = {};
  const label = values.label.trim();

  if (label.length === 0) {
    errors.label = 'Enter a label for this channel.';
  } else if (label.length > LABEL_MAX_LENGTH) {
    errors.label = `Label must be ${LABEL_MAX_LENGTH} characters or fewer.`;
  }

  const dailyCapRaw = values.dailyCap.trim();
  if (dailyCapRaw.length > 0) {
    if (!/^\d+$/.test(dailyCapRaw)) {
      errors.dailyCap = 'Enter a whole number, or leave it blank for no cap.';
    } else {
      const cap = Number.parseInt(dailyCapRaw, 10);
      if (cap < 1 || cap > DAILY_CAP_MAX) {
        errors.dailyCap = `Daily cap must be between 1 and ${DAILY_CAP_MAX}.`;
      }
    }
  }

  for (const field of PROVIDER_FIELDS[values.provider]) {
    const value = (values.config[field.key] ?? '').trim();
    if (value.length > 0) {
      continue;
    }
    const keepsSecret =
      field.kind === 'secret' && (editingChannel?.secretKeys.includes(field.key) ?? false);
    if (!keepsSecret) {
      errors[field.key] = `Enter the ${field.label.toLowerCase()}.`;
    }
  }

  return errors;
}

function ChannelCard({
  channel,
  isTesting,
  disabled,
  onTest,
  onEdit,
  onDelete,
}: {
  channel: ShareChannel;
  isTesting: boolean;
  disabled: boolean;
  onTest: (channel: ShareChannel) => void;
  onEdit: (channel: ShareChannel) => void;
  onDelete: (channel: ShareChannel) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {PROVIDER_LABEL.get(channel.provider) ?? channel.provider}
        </Badge>
        {channel.enabled ? (
          <Badge variant="secondary">Enabled</Badge>
        ) : (
          <Badge variant="outline">Disabled</Badge>
        )}
        {channel.requireApproval ? <Badge variant="outline">Approval required</Badge> : null}
      </div>

      <h3 className="truncate text-base font-semibold text-foreground" title={channel.label}>
        {channel.label}
      </h3>

      <dl className="flex flex-col gap-1 text-xs tabular-nums text-muted-foreground">
        <div className="flex items-center gap-2">
          <dt className="tracking-[0.06em] uppercase">Daily cap</dt>
          <dd className="text-foreground">
            {channel.dailyCap === null ? 'None' : channel.dailyCap.toLocaleString('en-US')}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="tracking-[0.06em] uppercase">Last success</dt>
          <dd className="text-foreground">
            {channel.lastSuccessAt ? (
              <time
                dateTime={channel.lastSuccessAt}
                title={formatAbsoluteTime(channel.lastSuccessAt)}
              >
                {formatRelativeTime(channel.lastSuccessAt)}
              </time>
            ) : (
              'Never'
            )}
          </dd>
        </div>
      </dl>

      {channel.needsAttention ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            {channel.lastError ?? 'This channel needs attention.'}
          </span>
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          disabled={disabled}
          aria-label={`Send a test message to ${channel.label}`}
          onClick={() => onTest(channel)}
        >
          {isTesting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          Test
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          disabled={disabled}
          aria-label={`Edit ${channel.label}`}
          onClick={() => onEdit(channel)}
        >
          <PencilIcon />
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="whitespace-nowrap text-destructive"
          disabled={disabled}
          aria-label={`Delete ${channel.label}`}
          onClick={() => onDelete(channel)}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </article>
  );
}

function ChannelFormDialog({
  isOpen,
  editingChannel,
  onOpenChange,
  onSubmit,
}: {
  isOpen: boolean;
  editingChannel: ShareChannel | null;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (values: ChannelFormValues) => Promise<ChannelFormErrors | null>;
}) {
  const [values, setValues] = useState<ChannelFormValues>({
    label: '',
    provider: 'telegram',
    enabled: true,
    dailyCap: '',
    requireApproval: false,
    config: {},
  });
  const [errors, setErrors] = useState<ChannelFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const provider = editingChannel?.provider ?? 'telegram';
    const config: Record<string, string> = {};
    for (const field of PROVIDER_FIELDS[provider]) {
      if (field.kind === 'public') {
        config[field.key] = editingChannel?.config[field.key] ?? '';
      }
    }
    setValues({
      label: editingChannel?.label ?? '',
      provider,
      enabled: editingChannel?.enabled ?? true,
      dailyCap:
        editingChannel?.dailyCap === null || editingChannel?.dailyCap === undefined
          ? ''
          : String(editingChannel.dailyCap),
      requireApproval: editingChannel?.requireApproval ?? false,
      config,
    });
    setErrors({});
    setIsSubmitting(false);
  }, [isOpen, editingChannel]);

  const registerField = (key: string) => (node: HTMLInputElement | HTMLSelectElement | null) => {
    fieldRefs.current[key] = node;
  };

  const focusFirstError = (nextErrors: ChannelFormErrors) => {
    const order = [
      'label',
      'dailyCap',
      ...PROVIDER_FIELDS[values.provider].map((field) => field.key),
    ];
    for (const key of order) {
      if (nextErrors[key]) {
        fieldRefs.current[key]?.focus();
        return;
      }
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleProviderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const provider = event.target.value as ShareProvider;
    setValues((current) => ({ ...current, provider, config: {} }));
  };

  const updateConfigValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const validationErrors = validateChannelForm(values, editingChannel);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    const serverErrors = await onSubmit(values).finally(() => setIsSubmitting(false));
    if (serverErrors) {
      setErrors(serverErrors);
      focusFirstError(serverErrors);
      return;
    }
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogSurface className="max-h-[90dvh] overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
            {editingChannel ? 'Edit channel' : 'New channel'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {editingChannel
              ? 'Update where this channel sends and how it is limited.'
              : 'Connect a destination so published posts are shared automatically.'}
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="sharing-channel-label">Label</Label>
            <Input
              id="sharing-channel-label"
              ref={registerField('label')}
              value={values.label}
              maxLength={LABEL_MAX_LENGTH}
              autoComplete="off"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.label)}
              aria-describedby={errors.label ? 'sharing-channel-label-error' : undefined}
              placeholder="Main Telegram channel"
              onChange={(event) =>
                setValues((current) => ({ ...current, label: event.target.value }))
              }
            />
            {errors.label ? (
              <p id="sharing-channel-label-error" className="text-sm text-destructive">
                {errors.label}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sharing-channel-provider">Provider</Label>
              <Select
                id="sharing-channel-provider"
                ref={registerField('provider')}
                value={values.provider}
                disabled={isSubmitting}
                onChange={handleProviderChange}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sharing-channel-daily-cap">Daily cap</Label>
              <Input
                id="sharing-channel-daily-cap"
                ref={registerField('dailyCap')}
                inputMode="numeric"
                value={values.dailyCap}
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.dailyCap)}
                aria-describedby={
                  errors.dailyCap
                    ? 'sharing-channel-daily-cap-error'
                    : 'sharing-channel-daily-cap-help'
                }
                placeholder="No cap"
                onChange={(event) =>
                  setValues((current) => ({ ...current, dailyCap: event.target.value }))
                }
              />
              {errors.dailyCap ? (
                <p id="sharing-channel-daily-cap-error" className="text-sm text-destructive">
                  {errors.dailyCap}
                </p>
              ) : (
                <p id="sharing-channel-daily-cap-help" className="text-xs text-muted-foreground">
                  Optional. The most sends per day for this channel.
                </p>
              )}
            </div>
          </div>

          {PROVIDER_FIELDS[values.provider].map((field) => {
            const inputId = `sharing-field-${field.key}`;
            const errorId = `${inputId}-error`;
            const helpId = `${inputId}-help`;
            const isSecret = field.kind === 'secret';
            const keepsSecret =
              isSecret && (editingChannel?.secretKeys.includes(field.key) ?? false);

            return (
              <div key={field.key} className="flex flex-col gap-2">
                <Label htmlFor={inputId}>{field.label}</Label>
                <Input
                  id={inputId}
                  ref={registerField(field.key)}
                  type={isSecret ? 'password' : 'text'}
                  value={values.config[field.key] ?? ''}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isSubmitting}
                  className="font-mono"
                  aria-invalid={Boolean(errors[field.key])}
                  aria-describedby={errors[field.key] ? errorId : keepsSecret ? helpId : undefined}
                  placeholder={field.placeholder}
                  onChange={(event) => updateConfigValue(field.key, event.target.value)}
                />
                {errors[field.key] ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {errors[field.key]}
                  </p>
                ) : keepsSecret ? (
                  <p id={helpId} className="text-xs text-muted-foreground">
                    Leave blank to keep the saved value. It is never shown in full.
                  </p>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-input"
                checked={values.enabled}
                disabled={isSubmitting}
                onChange={(event) =>
                  setValues((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>
                Enabled
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  A disabled channel keeps its place in the outbox but does not send.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-input"
                checked={values.requireApproval}
                disabled={isSubmitting}
                onChange={(event) =>
                  setValues((current) => ({ ...current, requireApproval: event.target.checked }))
                }
              />
              <span>
                Require approval
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Jobs wait for an Approve action before this channel sends them.
                </span>
              </span>
            </label>
          </div>

          {errors.form ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.form}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              className="whitespace-nowrap"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
              {editingChannel
                ? isSubmitting
                  ? 'Saving'
                  : 'Save changes'
                : isSubmitting
                  ? 'Creating'
                  : 'Create channel'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function DeleteChannelDialog({
  channel,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: {
  channel: ShareChannel | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={channel !== null} onOpenChange={handleOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
            Delete channel
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {channel
              ? `Delete ${channel.label}? Its queued outbox jobs are removed with it.`
              : 'Confirm the removal of this channel.'}
          </DialogPrimitive.Description>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            className="whitespace-nowrap"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            className="whitespace-nowrap"
            onClick={onConfirm}
          >
            {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            {isDeleting ? 'Deleting' : 'Delete channel'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

export default function SharingManager() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ShareChannel[]>([]);
  const [jobs, setJobs] = useState<ShareJob[]>([]);
  const [paused, setPaused] = useState(false);
  const [jobLimit, setJobLimit] = useState(DEFAULT_JOB_LIMIT);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPauseSaving, setIsPauseSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ShareChannel | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<ShareChannel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mutationRef = useRef<AbortController | null>(null);
  const hasDataRef = useRef(false);

  const loadSharing = useCallback(
    async (isSilent = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const isRefresh = isSilent && hasDataRef.current;
      setIsRefreshing(isRefresh);
      if (!isRefresh) {
        setStatus('loading');
      }
      setLoadError(null);

      try {
        const [overview, settings] = await Promise.all([
          requestJson<ShareOverview>(`${SHARING_ENDPOINT}?limit=${jobLimit}`, {
            signal: controller.signal,
          }),
          requestJson<{ paused: boolean }>(SHARING_SETTINGS_ENDPOINT, {
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) {
          return;
        }
        setChannels(overview.channels);
        setJobs(overview.jobs);
        setPaused(settings.paused);
        hasDataRef.current = overview.channels.length > 0 || overview.jobs.length > 0;
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setLoadError(toErrorMessage(error));
        if (!isSilent) {
          setStatus('error');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    },
    [jobLimit],
  );

  useEffect(() => {
    void loadSharing(hasDataRef.current);
    return () => {
      controllerRef.current?.abort();
      mutationRef.current?.abort();
    };
  }, [loadSharing]);

  const channelNameById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel.label])),
    [channels],
  );

  const handleTogglePause = async (next: boolean) => {
    if (isPauseSaving) {
      return;
    }
    setIsPauseSaving(true);

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      const payload = await requestJson<{ paused: boolean }>(SHARING_SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ paused: next }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setPaused(payload.paused);
      toast.success(payload.paused ? 'Automatic sharing paused.' : 'Automatic sharing resumed.');
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsPauseSaving(false);
      }
    }
  };

  const handleRunSharing = async () => {
    if (isRunning) {
      return;
    }
    setIsRunning(true);

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      const result = await requestJson<{
        sent: number;
        failed: number;
        deferred: number;
        remaining: number;
      }>(SHARING_RUN_ENDPOINT, { method: 'POST', signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      toast.success(
        `Sharing ran: ${result.sent} sent, ${result.deferred} deferred, ${result.failed} failed`,
      );
      await loadSharing(true);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsRunning(false);
      }
    }
  };

  const handleTestChannel = async (channel: ShareChannel) => {
    if (busyKey !== null) {
      return;
    }
    setBusyKey(`channel:${channel.id}`);

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      const result = await requestJson<ShareTestOutcome>(
        `${SHARING_ENDPOINT}/channels/${encodeURIComponent(channel.id)}/test`,
        { method: 'POST', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      if (result.outcome === 'success') {
        toast.success(`Test send to ${channel.label} delivered.`);
      } else {
        const detail = result.error ? ` ${result.error}` : '';
        toast.error(`${channel.label}: ${describeOutcome(result.outcome)}.${detail}`);
      }
      void loadSharing(true);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setBusyKey(null);
      }
    }
  };

  const handleFormSubmit = async (values: ChannelFormValues): Promise<ChannelFormErrors | null> => {
    const targetId = editingChannel?.id ?? null;
    const publicConfig: Record<string, string> = {};
    const secretConfig: Record<string, string> = {};

    for (const field of PROVIDER_FIELDS[values.provider]) {
      const value = (values.config[field.key] ?? '').trim();
      if (value.length === 0) {
        continue;
      }
      if (field.kind === 'secret') {
        secretConfig[field.key] = value;
      } else {
        publicConfig[field.key] = value;
      }
    }

    const dailyCapRaw = values.dailyCap.trim();
    const payload = {
      provider: values.provider,
      label: values.label.trim(),
      enabled: values.enabled,
      dailyCap: dailyCapRaw.length === 0 ? null : Number.parseInt(dailyCapRaw, 10),
      requireApproval: values.requireApproval,
      config: { public: publicConfig, secret: secretConfig },
    };

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      await requestJson<{ channel: ShareChannel }>(
        targetId
          ? `${SHARING_ENDPOINT}/channels/${encodeURIComponent(targetId)}`
          : `${SHARING_ENDPOINT}/channels`,
        {
          method: targetId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return null;
      }
      toast.success(targetId ? `Saved ${payload.label}.` : `Created ${payload.label}.`);
      void loadSharing(true);
      return null;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return null;
      }
      if (error instanceof ApiRequestError) {
        const mapped = mapFieldErrors(error.details);
        if (Object.keys(mapped).length > 0) {
          toast.error(error.message);
          return mapped;
        }
      }
      const message = toErrorMessage(error);
      toast.error(message);
      return { form: message };
    }
  };

  const handleDeleteChannel = async () => {
    const target = channelToDelete;
    if (!target || isDeleting) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${SHARING_ENDPOINT}/channels/${encodeURIComponent(target.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setChannels((current) => current.filter((entry) => entry.id !== target.id));
      setChannelToDelete(null);
      toast.success(`Deleted ${target.label}.`);
      void loadSharing(true);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      const message = toErrorMessage(error);
      setDeleteError(message);
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsDeleting(false);
      }
    }
  };

  const handleJobAction = async (job: ShareJob, action: 'retry' | 'approve') => {
    if (busyKey !== null) {
      return;
    }
    setBusyKey(`job:${job.id}`);

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      await requestJson<{ job: ShareJob }>(
        `${SHARING_ENDPOINT}/jobs/${encodeURIComponent(job.id)}`,
        {
          method: 'POST',
          body: JSON.stringify({ action }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      toast.success(action === 'retry' ? 'Sharing retry queued.' : 'Sharing approved.');
      void loadSharing(true);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setBusyKey(null);
      }
    }
  };

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">Loading sharing channels</span>
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-9 w-full max-w-sm" />
        </section>
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SKELETON_CARDS.map((cardKey) => (
            <div key={cardKey} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-8 w-40" />
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <section
        aria-label="Sharing"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load sharing channels</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadSharing(false)}>
          <RefreshCwIcon />
          Retry
        </Button>
      </section>
    );
  }

  const anyBusy = busyKey !== null;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Automatic sharing"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <Share2Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Automatic sharing</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              When a post is published, every enabled channel sends it once. Pausing holds the
              queue, it does not lose it.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-input"
            checked={paused}
            disabled={isPauseSaving}
            onChange={(event) => void handleTogglePause(event.target.checked)}
          />
          <span>
            Pause automatic sharing
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Stops every channel from sending until you turn it back on.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            role="status"
            aria-live="polite"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {isPauseSaving ? 'Saving' : paused ? 'Sharing is paused' : 'Sharing is active'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            disabled={isRunning || paused}
            onClick={() => void handleRunSharing()}
          >
            {isRunning ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {isRunning ? 'Running' : 'Run now'}
          </Button>
        </div>
      </section>

      {loadError !== null && hasDataRef.current ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={() => void loadSharing(true)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <section aria-label="Sharing channels" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Channels</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              disabled={isRefreshing}
              onClick={() => void loadSharing(true)}
            >
              <RefreshCwIcon className={cn(isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => {
                setEditingChannel(null);
                setIsFormOpen(true);
              }}
            >
              <PlusIcon />
              Add channel
            </Button>
          </div>
        </div>

        {channels.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
            <Share2Icon className="size-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">No sharing channels yet</p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                A channel is a destination such as Telegram or Discord. Add one and every published
                post is shared there automatically.
              </p>
            </div>
            <Button
              type="button"
              className="whitespace-nowrap"
              onClick={() => {
                setEditingChannel(null);
                setIsFormOpen(true);
              }}
            >
              <PlusIcon />
              Add channel
            </Button>
          </div>
        ) : (
          <div
            className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', isRefreshing && 'opacity-70')}
          >
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isTesting={busyKey === `channel:${channel.id}`}
                disabled={anyBusy}
                onTest={(target) => void handleTestChannel(target)}
                onEdit={(target) => {
                  setEditingChannel(target);
                  setIsFormOpen(true);
                }}
                onDelete={(target) => {
                  setDeleteError(null);
                  setChannelToDelete(target);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section
        aria-label="Sharing outbox"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Outbox</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Every send the channels have queued, sent, or failed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sharing-job-limit" className="text-xs text-muted-foreground">
              Jobs to show
            </Label>
            <Select
              id="sharing-job-limit"
              className="w-auto"
              value={jobLimit}
              disabled={isRefreshing}
              onChange={(event) => setJobLimit(Number(event.target.value))}
            >
              {JOB_LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <span
          role="status"
          aria-live="polite"
          className="text-xs tabular-nums text-muted-foreground"
        >
          {isRefreshing ? 'Updating' : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`}
        </span>

        {jobs.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No sharing jobs yet. They appear here once a post is published and a channel picks it
            up.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Post</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Attempts / failures</TableHead>
                <TableHead>Next attempt</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const sharedUrl = toSafeUrl(job.sharedUrl);
                const isJobBusy = busyKey === `job:${job.id}`;

                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span title={job.postId}>{truncateId(job.postId)}</span>
                      {sharedUrl ? (
                        <>
                          {' '}
                          <a
                            href={sharedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground underline underline-offset-4"
                            aria-label={`Open the shared post for ${job.postId}`}
                          >
                            Open
                          </a>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {channelNameById.get(job.channelId) ?? job.channelId}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {job.attempts} / {job.failures}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      <time
                        dateTime={job.nextAttemptAt}
                        title={formatAbsoluteTime(job.nextAttemptAt)}
                      >
                        {formatRelativeTime(job.nextAttemptAt)}
                      </time>
                    </TableCell>
                    <TableCell className="max-w-[16rem] whitespace-normal text-muted-foreground">
                      {job.error ? (
                        <span className="break-words" title={job.error}>
                          {job.error}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === 'awaiting_approval' ? (
                          <Button
                            type="button"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={anyBusy}
                            aria-label={`Approve sharing job for ${job.postId}`}
                            onClick={() => void handleJobAction(job, 'approve')}
                          >
                            {isJobBusy ? <Loader2Icon className="animate-spin" /> : null}
                            Approve
                          </Button>
                        ) : null}
                        {job.status !== 'sent' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={anyBusy}
                            aria-label={`Retry sharing job for ${job.postId}`}
                            onClick={() => void handleJobAction(job, 'retry')}
                          >
                            {isJobBusy ? <Loader2Icon className="animate-spin" /> : null}
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <ChannelFormDialog
        isOpen={isFormOpen}
        editingChannel={editingChannel}
        onOpenChange={(isOpen) => {
          setIsFormOpen(isOpen);
          if (!isOpen) {
            setEditingChannel(null);
          }
        }}
        onSubmit={handleFormSubmit}
      />

      <DeleteChannelDialog
        channel={channelToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setChannelToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDeleteChannel()}
      />
    </div>
  );
}
