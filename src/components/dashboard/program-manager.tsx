import {
  ArrowRightIcon,
  MegaphoneIcon,
  MousePointerClickIcon,
  PackageIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const PROGRAMS_ENDPOINT = '/api/dashboard/monetization/programs';
const REPORT_ENDPOINT = '/api/dashboard/monetization/report';
const PROGRAM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROGRAM_ID_MESSAGE =
  'Use lowercase letters, numbers, and single hyphens, for example amazon-us.';
const NAME_MAX_LENGTH = 80;
const TRACKING_ID_MAX_LENGTH = 120;
const TRACKING_ID_MESSAGE = 'Use letters, numbers, hyphens, or underscores.';
const LINK_TEMPLATE_MAX_LENGTH = 500;
const DISCLOSURE_MAX_LENGTH = 1000;
const SAFE_TRACKING_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_LINK_TEMPLATE = /^https?:\/\/[^\s"'<>]+$/;
const SKELETON_CARDS = ['program-skeleton-1', 'program-skeleton-2', 'program-skeleton-3'];

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

export type AffiliateNetwork = 'amazon' | 'impact' | 'partnerstack' | 'shareasale' | 'direct';
export type AffiliateStatus = 'pending' | 'approved' | 'paused';

export interface ProgramRecord {
  id: string;
  name: string;
  network: AffiliateNetwork;
  trackingId: string | null;
  linkTemplate: string | null;
  status: AffiliateStatus;
  disclosure: string;
  productCount: number;
  activeProductCount: number;
}

export interface MonetizationReport {
  brokenReferences: Array<{ postId: string; postTitle: string; slug: string }>;
  topProducts: Array<{ productId: string; slug: string; name: string; clicks: number }>;
  clicksLast30Days: number;
  productsWithoutProgram: number;
  inactiveProducts: number;
}

const NETWORK_OPTIONS: { value: AffiliateNetwork; label: string }[] = [
  { value: 'amazon', label: 'Amazon Associates' },
  { value: 'impact', label: 'Impact' },
  { value: 'partnerstack', label: 'PartnerStack' },
  { value: 'shareasale', label: 'ShareASale' },
  { value: 'direct', label: 'Direct' },
];

const STATUS_OPTIONS: { value: AffiliateStatus; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'paused', label: 'Paused' },
];

const STATUS_LABEL: Record<AffiliateStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  paused: 'Paused',
};

const STATUS_CLASS: Record<AffiliateStatus, string> = {
  approved: 'border-transparent bg-foreground text-background',
  pending: 'border-border bg-transparent text-muted-foreground',
  paused: 'border-border bg-muted text-muted-foreground',
};

const NETWORK_LABEL = new Map(NETWORK_OPTIONS.map((option) => [option.value, option.label]));

export function mapFieldErrors(details: unknown): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!details || typeof details !== 'object') {
    return mapped;
  }
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return mapped;
  }
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }
    const field = (issue as { field?: unknown }).field;
    const message = (issue as { message?: unknown }).message;
    if (typeof field !== 'string' || typeof message !== 'string') {
      continue;
    }
    const key = field.split('.').pop() ?? field;
    if (!mapped[key]) {
      mapped[key] = message;
    }
  }
  return mapped;
}

export function describeAffiliateFailure(program: ProgramRecord | null): string {
  if (!program) {
    return 'Assign this product to a program to build a link.';
  }
  if (program.status === 'paused') {
    return `${program.name} is paused. Resume the program to build links again.`;
  }
  if (program.status === 'pending') {
    return `${program.name} is still pending approval. Links start working once the network approves it.`;
  }
  if (!program.trackingId) {
    return `${program.name} has no tracking id. Add one in programs so links can be built.`;
  }
  if (!program.linkTemplate) {
    return `${program.name} has no link template. Add one with {target} and {trackingId} in programs.`;
  }
  return `${program.name} cannot build a link for this target.`;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function describeMissingPlaceholders(template: string): string {
  const missing: string[] = [];
  if (!template.includes('{target}')) {
    missing.push('{target}');
  }
  if (!template.includes('{trackingId}')) {
    missing.push('{trackingId}');
  }
  if (missing.length === 0) {
    return '';
  }
  return `Add ${missing.join(' and ')} to this template, otherwise no link can be built.`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

interface ProgramFormValues {
  id: string;
  name: string;
  network: AffiliateNetwork;
  trackingId: string;
  linkTemplate: string;
  status: AffiliateStatus;
  disclosure: string;
}

interface ProgramFormErrors {
  id?: string;
  name?: string;
  network?: string;
  trackingId?: string;
  linkTemplate?: string;
  status?: string;
  disclosure?: string;
  form?: string;
}

function validateProgramForm(values: ProgramFormValues): ProgramFormErrors {
  const errors: ProgramFormErrors = {};
  const name = values.name.trim();
  const trackingId = values.trackingId.trim();
  const linkTemplate = values.linkTemplate.trim();
  const disclosure = values.disclosure.trim();

  if (!PROGRAM_ID_PATTERN.test(values.id)) {
    errors.id = PROGRAM_ID_MESSAGE;
  } else if (values.id.length > 60) {
    errors.id = 'Id must be 60 characters or fewer.';
  }

  if (name.length < 2 || name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be between 2 and ${NAME_MAX_LENGTH} characters.`;
  }

  if (!NETWORK_LABEL.has(values.network)) {
    errors.network = 'Choose a network.';
  }

  if (trackingId.length > TRACKING_ID_MAX_LENGTH) {
    errors.trackingId = `Tracking id must be ${TRACKING_ID_MAX_LENGTH} characters or fewer.`;
  } else if (trackingId.length > 0 && !SAFE_TRACKING_ID.test(trackingId)) {
    errors.trackingId = TRACKING_ID_MESSAGE;
  }

  if (linkTemplate.length > LINK_TEMPLATE_MAX_LENGTH) {
    errors.linkTemplate = `Link template must be ${LINK_TEMPLATE_MAX_LENGTH} characters or fewer.`;
  } else if (linkTemplate.length > 0) {
    if (!isHttpUrl(linkTemplate)) {
      errors.linkTemplate = 'Start the template with http:// or https://.';
    } else if (!SAFE_LINK_TEMPLATE.test(linkTemplate)) {
      errors.linkTemplate = 'Remove spaces, quotes, and angle brackets from the template.';
    } else if (!linkTemplate.includes('{target}') || !linkTemplate.includes('{trackingId}')) {
      errors.linkTemplate = 'The template must contain both {target} and {trackingId}.';
    }
  }

  if (disclosure.length > DISCLOSURE_MAX_LENGTH) {
    errors.disclosure = `Disclosure must be ${DISCLOSURE_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

export function StatusPill({ status }: { status: AffiliateStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn('text-[0.625rem] tracking-[0.08em]', STATUS_CLASS[status])}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function ProgramCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-52" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function ProgramCard({
  program,
  isBusy,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  program: ProgramRecord;
  isBusy: boolean;
  onEdit: (program: ProgramRecord) => void;
  onToggleStatus: (program: ProgramRecord) => void;
  onDelete: (program: ProgramRecord) => void;
}) {
  const isPaused = program.status === 'paused';

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {NETWORK_LABEL.get(program.network) ?? program.network}
          </Badge>
          <StatusPill status={program.status} />
        </div>
        <h3 className="truncate text-base font-semibold text-foreground" title={program.name}>
          {program.name}
        </h3>
        <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
          {program.trackingId ? program.trackingId : 'No tracking id'}
        </p>
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={program.linkTemplate ?? ''}
        >
          {program.linkTemplate ?? 'No link template'}
        </p>
      </div>

      <p className="text-xs tabular-nums text-muted-foreground">
        {formatCount(program.activeProductCount)} active of {formatCount(program.productCount)}{' '}
        {program.productCount === 1 ? 'product' : 'products'}
      </p>

      {program.disclosure ? (
        <p className="line-clamp-2 text-sm text-muted-foreground" title={program.disclosure}>
          {program.disclosure}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No program disclosure.</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="whitespace-nowrap"
          aria-pressed={isPaused}
          disabled={isBusy}
          onClick={() => onToggleStatus(program)}
        >
          {isPaused ? <PlayIcon /> : <PauseIcon />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          disabled={isBusy}
          aria-label={`Edit ${program.name}`}
          onClick={() => onEdit(program)}
        >
          <PencilIcon />
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="whitespace-nowrap text-destructive"
          disabled={isBusy}
          aria-label={`Delete ${program.name}`}
          onClick={() => onDelete(program)}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </article>
  );
}

function ProgramFormDialog({
  isOpen,
  editingProgram,
  onOpenChange,
  onSubmit,
}: {
  isOpen: boolean;
  editingProgram: ProgramRecord | null;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (values: ProgramFormValues) => Promise<ProgramFormErrors | null>;
}) {
  const [values, setValues] = useState<ProgramFormValues>({
    id: '',
    name: '',
    network: 'amazon',
    trackingId: '',
    linkTemplate: '',
    status: 'pending',
    disclosure: '',
  });
  const [errors, setErrors] = useState<ProgramFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const networkRef = useRef<HTMLSelectElement>(null);
  const trackingIdRef = useRef<HTMLInputElement>(null);
  const linkTemplateRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLSelectElement>(null);
  const disclosureRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setValues({
      id: editingProgram?.id ?? '',
      name: editingProgram?.name ?? '',
      network: editingProgram?.network ?? 'amazon',
      trackingId: editingProgram?.trackingId ?? '',
      linkTemplate: editingProgram?.linkTemplate ?? '',
      status: editingProgram?.status ?? 'pending',
      disclosure: editingProgram?.disclosure ?? '',
    });
    setErrors({});
    setIsSubmitting(false);
  }, [isOpen, editingProgram]);

  const focusFirstError = (nextErrors: ProgramFormErrors) => {
    const order: Array<[keyof ProgramFormErrors, { focus: () => void } | null]> = [
      ['id', idRef.current],
      ['name', nameRef.current],
      ['network', networkRef.current],
      ['trackingId', trackingIdRef.current],
      ['linkTemplate', linkTemplateRef.current],
      ['status', statusRef.current],
      ['disclosure', disclosureRef.current],
    ];
    for (const [key, node] of order) {
      if (nextErrors[key] && node) {
        node.focus();
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

  const updateValue = <K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const validationErrors = validateProgramForm(values);
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

  const linkTemplatePreview = values.linkTemplate.trim();
  const isLinkTemplateReady =
    linkTemplatePreview.includes('{target}') && linkTemplatePreview.includes('{trackingId}');

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogSurface className="max-h-[90dvh] overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            {editingProgram ? 'Edit program' : 'New program'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {editingProgram
              ? 'Update the network, tracking, and disclosure for this program.'
              : 'Connect an affiliate network so products can generate tracked links.'}
          </DialogPrimitive.Description>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-id">Id</Label>
            <Input
              id="program-id"
              ref={idRef}
              value={values.id}
              disabled={editingProgram !== null}
              onChange={(event) => updateValue('id', event.target.value)}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={Boolean(errors.id)}
              aria-describedby={errors.id ? 'program-id-error program-id-help' : 'program-id-help'}
              placeholder="amazon-us"
            />
            <p id="program-id-help" className="text-xs text-muted-foreground">
              {editingProgram
                ? 'The id cannot change after the program is created.'
                : 'A short slug used in URLs and product links.'}
            </p>
            {errors.id ? (
              <p id="program-id-error" className="text-sm text-destructive">
                {errors.id}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="program-name">Name</Label>
            <Input
              id="program-name"
              ref={nameRef}
              value={values.name}
              onChange={(event) => updateValue('name', event.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'program-name-error' : undefined}
              placeholder="Amazon Associates"
            />
            {errors.name ? (
              <p id="program-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="program-network">Network</Label>
              <Select
                id="program-network"
                ref={networkRef}
                value={values.network}
                aria-invalid={Boolean(errors.network)}
                aria-describedby={errors.network ? 'program-network-error' : undefined}
                onChange={(event) => updateValue('network', event.target.value as AffiliateNetwork)}
              >
                {NETWORK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {errors.network ? (
                <p id="program-network-error" className="text-sm text-destructive">
                  {errors.network}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="program-status">Status</Label>
              <Select
                id="program-status"
                ref={statusRef}
                value={values.status}
                aria-invalid={Boolean(errors.status)}
                aria-describedby={errors.status ? 'program-status-error' : 'program-status-help'}
                onChange={(event) => updateValue('status', event.target.value as AffiliateStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p id="program-status-help" className="text-xs text-muted-foreground">
                Links are only built while the status is approved.
              </p>
              {errors.status ? (
                <p id="program-status-error" className="text-sm text-destructive">
                  {errors.status}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="program-tracking-id">Tracking id</Label>
            <Input
              id="program-tracking-id"
              ref={trackingIdRef}
              value={values.trackingId}
              onChange={(event) => updateValue('trackingId', event.target.value)}
              maxLength={TRACKING_ID_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={Boolean(errors.trackingId)}
              aria-describedby={
                errors.trackingId ? 'program-tracking-id-error' : 'program-tracking-id-help'
              }
              placeholder="lightscripts-20"
            />
            <p id="program-tracking-id-help" className="text-xs text-muted-foreground">
              The id the network uses to attribute clicks to this site.
            </p>
            {errors.trackingId ? (
              <p id="program-tracking-id-error" className="text-sm text-destructive">
                {errors.trackingId}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="program-link-template">Link template</Label>
            <Input
              id="program-link-template"
              ref={linkTemplateRef}
              value={values.linkTemplate}
              onChange={(event) => updateValue('linkTemplate', event.target.value)}
              maxLength={LINK_TEMPLATE_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              aria-invalid={Boolean(errors.linkTemplate)}
              aria-describedby={
                errors.linkTemplate ? 'program-link-template-error' : 'program-link-template-help'
              }
              placeholder="https://www.amazon.com/dp/{target}?tag={trackingId}"
            />
            <p id="program-link-template-help" className="text-xs text-muted-foreground">
              Must contain <span className="font-mono">{'{target}'}</span> and{' '}
              <span className="font-mono">{'{trackingId}'}</span>. Nothing is linked while either
              placeholder is missing.
            </p>
            {linkTemplatePreview.length > 0 && !isLinkTemplateReady ? (
              <p className="text-xs text-destructive">
                {describeMissingPlaceholders(values.linkTemplate)}
              </p>
            ) : null}
            {errors.linkTemplate ? (
              <p id="program-link-template-error" className="text-sm text-destructive">
                {errors.linkTemplate}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="program-disclosure">Disclosure</Label>
            <textarea
              id="program-disclosure"
              ref={disclosureRef}
              rows={3}
              className={TEXTAREA_CLASS}
              value={values.disclosure}
              maxLength={DISCLOSURE_MAX_LENGTH}
              aria-invalid={Boolean(errors.disclosure)}
              aria-describedby={
                errors.disclosure ? 'program-disclosure-error' : 'program-disclosure-help'
              }
              placeholder="As an Amazon Associate I earn from qualifying purchases."
              onChange={(event) => updateValue('disclosure', event.target.value)}
            />
            <p id="program-disclosure-help" className="text-xs text-muted-foreground">
              Shown on posts that use products from this program. It takes priority over the global
              disclosure in settings.
            </p>
            {errors.disclosure ? (
              <p id="program-disclosure-error" className="text-sm text-destructive">
                {errors.disclosure}
              </p>
            ) : null}
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
              {editingProgram
                ? isSubmitting
                  ? 'Saving'
                  : 'Save changes'
                : isSubmitting
                  ? 'Creating'
                  : 'Create program'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function DeleteProgramDialog({
  program,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: {
  program: ProgramRecord | null;
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
    <DialogPrimitive.Root open={program !== null} onOpenChange={handleOpenChange}>
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Delete program
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {program
              ? `Delete ${program.name}? Links for its products stop working immediately.`
              : 'Confirm the removal of this program.'}
          </DialogPrimitive.Description>
        </div>

        {program && program.productCount > 0 ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="tabular-nums">{formatCount(program.productCount)}</span>{' '}
            {program.productCount === 1 ? 'product still belongs' : 'products still belong'} to this
            program. Move them to another program first, or they will lose their links.
          </p>
        ) : null}

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
            {isDeleting ? 'Deleting' : 'Delete program'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function StatusStripMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {formatCount(value)}
      </p>
    </div>
  );
}

export default function ProgramManager() {
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [report, setReport] = useState<MonetizationReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramRecord | null>(null);
  const [programToDelete, setProgramToDelete] = useState<ProgramRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mutationRef = useRef<AbortController | null>(null);
  const hasProgramsRef = useRef(false);

  const loadData = useCallback(async (isSilent = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const isRefresh = isSilent && hasProgramsRef.current;
    setIsRefreshing(isRefresh);
    if (!isRefresh) {
      setStatus('loading');
    }
    setLoadError(null);

    try {
      const [programPayload, reportPayload] = await Promise.all([
        requestJson<{ programs: ProgramRecord[] }>(PROGRAMS_ENDPOINT, {
          signal: controller.signal,
        }),
        requestJson<MonetizationReport>(REPORT_ENDPOINT, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) {
        return;
      }
      setPrograms(programPayload.programs);
      hasProgramsRef.current = programPayload.programs.length > 0;
      setReport(reportPayload);
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
  }, []);

  useEffect(() => {
    void loadData(false);
    return () => {
      controllerRef.current?.abort();
      mutationRef.current?.abort();
    };
  }, [loadData]);

  const handleFormSubmit = async (values: ProgramFormValues): Promise<ProgramFormErrors | null> => {
    const targetId = editingProgram?.id ?? null;
    const payload = {
      id: values.id.trim(),
      name: values.name.trim(),
      network: values.network,
      trackingId: values.trackingId.trim() || null,
      linkTemplate: values.linkTemplate.trim() || null,
      status: values.status,
      disclosure: values.disclosure.trim(),
    };

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      await requestJson<{ program: ProgramRecord }>(
        targetId ? `${PROGRAMS_ENDPOINT}/${encodeURIComponent(targetId)}` : PROGRAMS_ENDPOINT,
        {
          method: targetId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return null;
      }
      toast.success(targetId ? `Saved ${payload.name}.` : `Created ${payload.name}.`);
      void loadData(true);
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

  const handleToggleStatus = async (program: ProgramRecord) => {
    if (busyId !== null) {
      return;
    }
    const nextStatus: AffiliateStatus = program.status === 'paused' ? 'approved' : 'paused';
    setBusyId(program.id);
    setPrograms((current) =>
      current.map((entry) => (entry.id === program.id ? { ...entry, status: nextStatus } : entry)),
    );

    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;

    try {
      await requestJson<{ program: ProgramRecord }>(
        `${PROGRAMS_ENDPOINT}/${encodeURIComponent(program.id)}`,
        {
          method: 'PUT',
          signal: controller.signal,
          body: JSON.stringify({
            id: program.id,
            name: program.name,
            network: program.network,
            trackingId: program.trackingId,
            linkTemplate: program.linkTemplate,
            status: nextStatus,
            disclosure: program.disclosure,
          }),
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      toast.success(
        nextStatus === 'paused' ? `Paused ${program.name}.` : `Resumed ${program.name}.`,
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setPrograms((current) =>
        current.map((entry) =>
          entry.id === program.id ? { ...entry, status: program.status } : entry,
        ),
      );
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setBusyId(null);
        void loadData(true);
      }
    }
  };

  const handleDelete = async () => {
    const target = programToDelete;
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
        `${PROGRAMS_ENDPOINT}/${encodeURIComponent(target.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setPrograms((current) => current.filter((entry) => entry.id !== target.id));
      toast.success(`Deleted ${target.name}.`);
      setProgramToDelete(null);
      void loadData(true);
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

  const showSkeleton = status === 'loading' && programs.length === 0;
  const showErrorState = status === 'error' && programs.length === 0;
  const showEmpty = status === 'ready' && programs.length === 0;
  const activeProducts = programs.reduce((total, program) => total + program.activeProductCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Programs
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Two paths bring in revenue: affiliate links from products and ads on your pages. Start
            with the programs you have been approved for, then add products so posts can link to
            them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="whitespace-nowrap">
            <a href="/dashboard/monetization/catalog">
              Product catalog
              <ArrowRightIcon />
            </a>
          </Button>
          <Button
            type="button"
            className="whitespace-nowrap"
            onClick={() => {
              setEditingProgram(null);
              setIsFormOpen(true);
            }}
          >
            <PlusIcon />
            New program
          </Button>
        </div>
      </div>

      {report ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatusStripMetric label="Programs" value={programs.length} />
          <StatusStripMetric label="Active products" value={activeProducts} />
          <StatusStripMetric label="Clicks last 30 days" value={report.clicksLast30Days} />
          <StatusStripMetric label="Broken references" value={report.brokenReferences.length} />
        </div>
      ) : null}

      {loadError !== null && programs.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={() => void loadData(true)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <div role="status" aria-live="polite" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <span className="sr-only">Loading programs</span>
          {SKELETON_CARDS.map((cardKey) => (
            <ProgramCardSkeleton key={cardKey} />
          ))}
        </div>
      ) : null}

      {showErrorState ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load programs</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData(false)}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <MegaphoneIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No affiliate programs yet</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              A program holds the network, your tracking id, and the link template. Products then
              pick a program and turn a target like an ASIN into a tracked link.
            </p>
          </div>
          <Button
            type="button"
            className="whitespace-nowrap"
            onClick={() => {
              setEditingProgram(null);
              setIsFormOpen(true);
            }}
          >
            <PlusIcon />
            New program
          </Button>
        </div>
      ) : null}

      {programs.length > 0 ? (
        <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', isRefreshing && 'opacity-70')}>
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              isBusy={busyId === program.id}
              onEdit={(target) => {
                setEditingProgram(target);
                setIsFormOpen(true);
              }}
              onToggleStatus={(target) => void handleToggleStatus(target)}
              onDelete={(target) => {
                setDeleteError(null);
                setProgramToDelete(target);
              }}
            />
          ))}
        </div>
      ) : null}

      {report ? (
        <section
          aria-label="Revenue paths"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <h3 className="text-sm font-medium text-foreground">Where revenue comes from</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <PackageIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Affiliate products</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Products in the catalog map to tracked links. Posts link to a product with the
                  product block, and every click is counted through the redirect.
                </p>
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                  {formatCount(report.clicksLast30Days)} clicks in the last 30 days.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <MousePointerClickIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Ads</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick an ad network and fill the three in-article slots. Slots only render when the
                  network is set and a slot id is present.
                </p>
                <a
                  href="/dashboard/monetization/settings"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-foreground underline underline-offset-4"
                >
                  Open monetization settings
                  <ArrowRightIcon className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <ProgramFormDialog
        isOpen={isFormOpen}
        editingProgram={editingProgram}
        onOpenChange={(isOpen) => {
          setIsFormOpen(isOpen);
          if (!isOpen) {
            setEditingProgram(null);
          }
        }}
        onSubmit={handleFormSubmit}
      />

      <DeleteProgramDialog
        program={programToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setProgramToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
