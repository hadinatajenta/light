import {
  Loader2Icon,
  NotebookTextIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import { mapFieldErrors } from './program-manager';

const TOPICS_ENDPOINT = '/api/dashboard/topics';
const NOTES_ENDPOINT = '/api/dashboard/topics/notes';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const HEADING_MIN_LENGTH = 3;
const HEADING_MAX_LENGTH = 140;
const DETAIL_MIN_LENGTH = 3;
const DETAIL_MAX_LENGTH = 2000;
const REFERENCE_MAX_LENGTH = 200;
const SKELETON_NOTES = ['note-skeleton-1', 'note-skeleton-2'];

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

export type TopicStatus = 'queued' | 'researched' | 'in_progress' | 'used' | 'blocked';

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  queued: 'Queued',
  researched: 'Researched',
  in_progress: 'In progress',
  used: 'Used',
  blocked: 'Blocked',
};

const TOPIC_STATUS_BADGE_VARIANT: Record<
  TopicStatus,
  'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
> = {
  queued: 'outline',
  researched: 'secondary',
  in_progress: 'default',
  used: 'ghost',
  blocked: 'destructive',
};

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  return (
    <Badge
      variant={TOPIC_STATUS_BADGE_VARIANT[status]}
      className={status === 'used' ? 'text-muted-foreground' : undefined}
    >
      {TOPIC_STATUS_LABELS[status]}
    </Badge>
  );
}

export function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'Unknown time';
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Unknown time';
  }
  const difference = Date.now() - timestamp;
  const distance = Math.abs(difference);
  if (distance < MINUTE_MS) {
    return 'Just now';
  }
  if (distance < HOUR_MS) {
    const minutes = Math.round(distance / MINUTE_MS);
    return difference >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }
  if (distance < DAY_MS) {
    const hours = Math.round(distance / HOUR_MS);
    return difference >= 0 ? `${hours}h ago` : `in ${hours}h`;
  }
  const days = Math.round(distance / DAY_MS);
  return difference >= 0 ? `${days}d ago` : `in ${days}d`;
}

export function formatAbsoluteTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }
  return parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export interface NoteRecord {
  id: string;
  topicId: string;
  agentId: string | null;
  kind: string;
  heading: string;
  detail: string;
  reference: string | null;
  createdAt: string;
}

export interface ResearchTopic {
  id: string;
  title: string;
  status: TopicStatus;
}

interface NoteFormValues {
  heading: string;
  detail: string;
  reference: string;
}

type NoteFieldErrors = Partial<Record<'heading' | 'detail' | 'reference' | 'form', string>>;

const KIND_LABELS: Record<string, string> = {
  note: 'Notes',
  spec: 'Specs',
  claim: 'Claims',
  source: 'Sources',
};

interface NoteGroup {
  kind: string;
  label: string;
  notes: NoteRecord[];
}

function toKindLabel(kind: string): string {
  const knownLabel = KIND_LABELS[kind];
  if (knownLabel) {
    return knownLabel;
  }
  const words = kind.split(/[^a-zA-Z0-9]+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return 'Other';
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function groupNotesByKind(notes: NoteRecord[]): NoteGroup[] {
  const buckets = new Map<string, NoteRecord[]>();
  for (const note of notes) {
    const bucket = buckets.get(note.kind);
    if (bucket) {
      bucket.push(note);
    } else {
      buckets.set(note.kind, [note]);
    }
  }

  return Array.from(buckets.entries())
    .map(([kind, entries]) => ({
      kind,
      label: toKindLabel(kind),
      notes: [...entries].sort(
        (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
      ),
    }))
    .sort(
      (left, right) =>
        toTimestamp(right.notes[0]?.createdAt ?? '') - toTimestamp(left.notes[0]?.createdAt ?? ''),
    );
}

function toSafeReferenceUrl(reference: string): string | null {
  try {
    const parsed = new URL(reference);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function validateNote(values: NoteFormValues): NoteFieldErrors {
  const errors: NoteFieldErrors = {};
  const heading = values.heading.trim();
  const detail = values.detail.trim();
  const reference = values.reference.trim();

  if (heading.length < HEADING_MIN_LENGTH) {
    errors.heading = `Heading must be at least ${HEADING_MIN_LENGTH} characters.`;
  } else if (heading.length > HEADING_MAX_LENGTH) {
    errors.heading = `Heading must be ${HEADING_MAX_LENGTH} characters or fewer.`;
  }

  if (detail.length < DETAIL_MIN_LENGTH) {
    errors.detail = 'Add the detail the writer should rely on.';
  } else if (detail.length > DETAIL_MAX_LENGTH) {
    errors.detail = `Detail must be ${DETAIL_MAX_LENGTH} characters or fewer.`;
  }

  if (reference.length > REFERENCE_MAX_LENGTH) {
    errors.reference = `Reference must be ${REFERENCE_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

interface ResearchNotesProps {
  topic: ResearchTopic | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export default function ResearchNotes({ topic, isOpen, onOpenChange }: ResearchNotesProps) {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [values, setValues] = useState<NoteFormValues>({ heading: '', detail: '', reference: '' });
  const [fieldErrors, setFieldErrors] = useState<NoteFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const notesControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const latestRequestRef = useRef(0);
  const loadedTopicIdRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);

  const topicId = topic?.id ?? null;

  const loadNotes = useCallback(
    async (isSilent = false) => {
      if (!topicId) {
        return;
      }

      notesControllerRef.current?.abort();
      const controller = new AbortController();
      notesControllerRef.current = controller;
      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;

      if (isSilent) {
        setIsRefreshing(true);
      } else {
        setStatus('loading');
        setLoadError(null);
      }

      try {
        const payload = await requestJson<{ notes: NoteRecord[] }>(
          `${TOPICS_ENDPOINT}/${encodeURIComponent(topicId)}/notes`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || latestRequestRef.current !== requestId) {
          return;
        }
        setNotes(payload.notes);
        setHasLoaded(true);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted || latestRequestRef.current !== requestId) {
          return;
        }
        setLoadError(toErrorMessage(error));
        if (!isSilent) {
          setStatus('error');
        }
      } finally {
        if (!controller.signal.aborted && latestRequestRef.current === requestId) {
          setIsRefreshing(false);
        }
      }
    },
    [topicId],
  );

  useEffect(() => {
    if (!isOpen || !topicId) {
      return;
    }

    if (loadedTopicIdRef.current !== topicId) {
      loadedTopicIdRef.current = topicId;
      setNotes([]);
      setHasLoaded(false);
    }

    setValues({ heading: '', detail: '', reference: '' });
    setFieldErrors({});
    setDeleteTargetId(null);
    setDeleteError(null);
    void loadNotes(false);

    return () => notesControllerRef.current?.abort();
  }, [isOpen, topicId, loadNotes]);

  useEffect(() => {
    return () => mutationControllerRef.current?.abort();
  }, []);

  const groups = useMemo(() => groupNotesByKind(notes), [notes]);
  const showSkeleton = status === 'loading' && !hasLoaded;
  const showErrorState = status === 'error' && !hasLoaded;
  const showEmptyState = status === 'ready' && notes.length === 0;
  const showStaleError = loadError !== null && hasLoaded;
  const noteCountLabel = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`;

  const focusFirstError = (nextErrors: NoteFieldErrors) => {
    if (nextErrors.heading) {
      headingRef.current?.focus();
      return;
    }
    if (nextErrors.detail) {
      detailRef.current?.focus();
      return;
    }
    referenceRef.current?.focus();
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !topicId) {
      return;
    }

    const validationErrors = validateNote(values);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }

    const heading = values.heading.trim();
    const detail = values.detail.trim();
    const reference = values.reference.trim();

    setIsSubmitting(true);
    setFieldErrors({});
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      await requestJson<{ note: NoteRecord }>(
        `${TOPICS_ENDPOINT}/${encodeURIComponent(topicId)}/notes`,
        {
          method: 'POST',
          body: JSON.stringify(
            reference.length > 0 ? { heading, detail, reference } : { heading, detail },
          ),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        return;
      }
      toast.success('Note added.');
      setValues({ heading: '', detail: '', reference: '' });
      void loadNotes(true);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiRequestError) {
        const mapped = mapFieldErrors(error.details);
        const serverErrors: NoteFieldErrors = {};
        if (mapped.heading) {
          serverErrors.heading = mapped.heading;
        }
        if (mapped.detail) {
          serverErrors.detail = mapped.detail;
        }
        if (mapped.reference) {
          serverErrors.reference = mapped.reference;
        }
        if (Object.keys(serverErrors).length > 0) {
          setFieldErrors(serverErrors);
          focusFirstError(serverErrors);
        }
      }
      const message = toErrorMessage(error);
      setFieldErrors((current) => ({ ...current, form: message }));
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteNote = async (note: NoteRecord) => {
    if (!topicId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${NOTES_ENDPOINT}/${encodeURIComponent(note.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setNotes((current) => current.filter((entry) => entry.id !== note.id));
      setDeleteTargetId(null);
      toast.success('Note deleted.');
    } catch (error) {
      if (controller.signal.aborted) {
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

  const renderNotes = () => {
    if (showSkeleton) {
      return (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Loading research notes</span>
          {SKELETON_NOTES.map((noteKey) => (
            <div key={noteKey} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      );
    }

    if (showErrorState) {
      return (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
          <TriangleAlertIcon className="size-6 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load research notes</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadNotes(false)}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      );
    }

    if (showEmptyState) {
      return (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
          <NotebookTextIcon className="size-6 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No research notes yet</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              The scrapper agent fills this automatically on its next run, one note per finding so
              the writer has evidence to cite. Notes added by hand are used by the writer in its
              next run.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={cn('flex flex-col gap-4', isRefreshing && 'opacity-60')}>
        {groups.map((group) => (
          <div key={group.kind} className="flex flex-col gap-2">
            <h4 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {group.label} ({group.notes.length})
            </h4>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {group.notes.map((note) => {
                const referenceUrl = note.reference ? toSafeReferenceUrl(note.reference) : null;

                return (
                  <li key={note.id} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{note.heading}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          <time
                            dateTime={note.createdAt}
                            title={formatAbsoluteTime(note.createdAt)}
                          >
                            {formatRelativeTime(note.createdAt)}
                          </time>
                        </p>
                      </div>

                      {deleteTargetId === note.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="whitespace-nowrap"
                            disabled={isDeleting}
                            onClick={() => void handleDeleteNote(note)}
                          >
                            {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                            Delete
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="whitespace-nowrap"
                            disabled={isDeleting}
                            onClick={() => setDeleteTargetId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={isDeleting}
                          aria-label={`Delete note ${note.heading}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTargetId(note.id);
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>

                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {note.detail}
                    </p>

                    {note.reference ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium tracking-[0.06em] uppercase">Reference</span>{' '}
                        {referenceUrl ? (
                          <a
                            href={referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-foreground underline underline-offset-4"
                          >
                            {note.reference}
                          </a>
                        ) : (
                          <span className="break-all text-foreground">{note.reference}</span>
                        )}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <DialogSurface className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
            {topic?.title ?? 'Research notes'}
          </DialogPrimitive.Title>
          <div className="flex flex-wrap items-center gap-2">
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Research notes the writer can draw on its next run.
            </DialogPrimitive.Description>
            {topic ? <TopicStatusBadge status={topic.status} /> : null}
          </div>
        </div>

        <section aria-label="Research notes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Notes</h3>
            <span
              role="status"
              aria-live="polite"
              className="text-xs tabular-nums text-muted-foreground"
            >
              {isRefreshing ? 'Updating' : noteCountLabel}
            </span>
          </div>

          {showStaleError ? (
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
                onClick={() => void loadNotes(true)}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {deleteError !== null ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {deleteError}
            </p>
          ) : null}

          {renderNotes()}
        </section>

        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-3"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <h3 className="text-sm font-medium text-foreground">Add note</h3>

          <div className="flex flex-col gap-2">
            <Label htmlFor="research-note-heading">Heading</Label>
            <Input
              id="research-note-heading"
              ref={headingRef}
              value={values.heading}
              autoComplete="off"
              maxLength={HEADING_MAX_LENGTH}
              placeholder="Contrast ratio claim to verify"
              aria-invalid={Boolean(fieldErrors.heading)}
              aria-describedby={fieldErrors.heading ? 'research-note-heading-error' : undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, heading: event.target.value }))
              }
            />
            {fieldErrors.heading ? (
              <p id="research-note-heading-error" className="text-sm text-destructive">
                {fieldErrors.heading}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="research-note-detail">Detail</Label>
            <textarea
              id="research-note-detail"
              ref={detailRef}
              rows={4}
              className={TEXTAREA_CLASS}
              value={values.detail}
              maxLength={DETAIL_MAX_LENGTH}
              placeholder="What the writer should know and cite."
              aria-invalid={Boolean(fieldErrors.detail)}
              aria-describedby={fieldErrors.detail ? 'research-note-detail-error' : undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, detail: event.target.value }))
              }
            />
            {fieldErrors.detail ? (
              <p id="research-note-detail-error" className="text-sm text-destructive">
                {fieldErrors.detail}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="research-note-reference">Reference (optional)</Label>
            <Input
              id="research-note-reference"
              ref={referenceRef}
              value={values.reference}
              autoComplete="off"
              spellCheck={false}
              maxLength={REFERENCE_MAX_LENGTH}
              placeholder="https://example.com/report"
              aria-invalid={Boolean(fieldErrors.reference)}
              aria-describedby={
                fieldErrors.reference
                  ? 'research-note-reference-error'
                  : 'research-note-reference-help'
              }
              onChange={(event) =>
                setValues((current) => ({ ...current, reference: event.target.value }))
              }
            />
            {fieldErrors.reference ? (
              <p id="research-note-reference-error" className="text-sm text-destructive">
                {fieldErrors.reference}
              </p>
            ) : (
              <p id="research-note-reference-help" className="text-xs text-muted-foreground">
                A source URL or citation the writer can point to.
              </p>
            )}
          </div>

          {fieldErrors.form ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {fieldErrors.form}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              {isSubmitting ? 'Adding' : 'Add note'}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}
