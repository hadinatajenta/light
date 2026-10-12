import {
  ArrowRightIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const REDIRECTS_ENDPOINT = '/api/dashboard/redirects';
const NOTE_MAX_LENGTH = 200;
const RESERVED_PREFIXES = ['/dashboard', '/api', '/media', '/_astro', '/go', '/blog', '/tag'];
const STATUS_CODES = [301, 302, 307, 308] as const;
const SKELETON_ROWS = ['redirect-row-1', 'redirect-row-2', 'redirect-row-3'];

interface RedirectRecord {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  hits: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RedirectFormValues {
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  note: string;
}

const EMPTY_FORM: RedirectFormValues = {
  fromPath: '',
  toPath: '',
  statusCode: 301,
  isActive: true,
  note: '',
};

function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  const withoutLeading = trimmed.replace(/^\/+/, '');
  const withoutTrailing = withoutLeading.replace(/\/+$/, '');
  const lowered = withoutTrailing.toLowerCase();
  return lowered.length === 0 ? '/' : `/${lowered}`;
}

function validateFromPath(raw: string): string | null {
  if (raw.trim().length === 0) {
    return 'Enter the path to redirect.';
  }

  const normalized = normalizePath(raw);
  if (normalized === '/') {
    return 'The home page cannot be redirected.';
  }
  if (/[\s?#]/.test(normalized)) {
    return 'Use a path without spaces, a query string, or a fragment.';
  }
  for (const prefix of RESERVED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return `${prefix} is reserved and cannot be redirected.`;
    }
  }

  return null;
}

function validateToPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'Enter a path or a full URL.';
  }
  if (trimmed.startsWith('/')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Enter an absolute path or a full URL.';
    }
    return null;
  } catch {
    return 'Enter an absolute path or a full URL.';
  }
}

function mapFieldErrors(details: unknown): Record<string, string> {
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

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function toFormValues(redirect: RedirectRecord): RedirectFormValues {
  return {
    fromPath: redirect.fromPath,
    toPath: redirect.toPath,
    statusCode: redirect.statusCode,
    isActive: redirect.isActive,
    note: redirect.note ?? '',
  };
}

export default function RedirectManager() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [redirects, setRedirects] = useState<RedirectRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RedirectRecord | null>(null);
  const [values, setValues] = useState<RedirectFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RedirectRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadRedirects = useCallback(async (isSilent = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (isSilent) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
    }
    setLoadError(null);

    try {
      const payload = await requestJson<{ redirects: RedirectRecord[] }>(REDIRECTS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setRedirects(payload.redirects);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
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
    void loadRedirects(false);
    return () => controllerRef.current?.abort();
  }, [loadRedirects]);

  const openCreate = () => {
    setEditing(null);
    setValues(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (redirect: RedirectRecord) => {
    setEditing(redirect);
    setValues(toFormValues(redirect));
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const fromError = validateFromPath(values.fromPath);
    const toError = validateToPath(values.toPath);
    const localErrors: Record<string, string> = {};
    if (fromError) {
      localErrors.fromPath = fromError;
    }
    if (toError) {
      localErrors.toPath = toError;
    }
    if (!fromError && !toError) {
      const target = values.toPath.trim().startsWith('/')
        ? normalizePath(values.toPath)
        : values.toPath.trim();
      if (normalizePath(values.fromPath) === target) {
        localErrors.toPath = 'A redirect cannot point to its own path.';
      }
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    const payload = {
      fromPath: values.fromPath.trim(),
      toPath: values.toPath.trim(),
      statusCode: values.statusCode,
      isActive: values.isActive,
      note: values.note.trim().length > 0 ? values.note.trim() : null,
    };

    try {
      if (editing) {
        await requestJson<{ redirect: RedirectRecord }>(
          `${REDIRECTS_ENDPOINT}/${encodeURIComponent(editing.id)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        toast.success('Redirect updated.');
      } else {
        await requestJson<{ redirect: RedirectRecord }>(REDIRECTS_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Redirect created.');
      }
      setDialogOpen(false);
      void loadRedirects(true);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(mapFieldErrors(error.details));
      }
      const message = toErrorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (redirect: RedirectRecord) => {
    if (busyId !== null) {
      return;
    }
    const nextActive = !redirect.isActive;
    setBusyId(redirect.id);
    setRedirects((current) =>
      current.map((entry) =>
        entry.id === redirect.id ? { ...entry, isActive: nextActive } : entry,
      ),
    );

    try {
      await requestJson<{ redirect: RedirectRecord }>(
        `${REDIRECTS_ENDPOINT}/${encodeURIComponent(redirect.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fromPath: redirect.fromPath,
            toPath: redirect.toPath,
            statusCode: redirect.statusCode,
            isActive: nextActive,
            note: redirect.note,
          }),
        },
      );
      toast.success(nextActive ? 'Redirect enabled.' : 'Redirect disabled.');
    } catch (error) {
      setRedirects((current) =>
        current.map((entry) =>
          entry.id === redirect.id ? { ...entry, isActive: redirect.isActive } : entry,
        ),
      );
      toast.error(toErrorMessage(error));
    } finally {
      setBusyId(null);
      void loadRedirects(true);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete || isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${REDIRECTS_ENDPOINT}/${encodeURIComponent(pendingDelete.id)}`,
        { method: 'DELETE' },
      );
      toast.success('Redirect deleted.');
      setPendingDelete(null);
      void loadRedirects(true);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const showSkeleton = status === 'loading' && redirects.length === 0;
  const showErrorState = status === 'error' && redirects.length === 0;
  const showEmpty = status === 'ready' && redirects.length === 0;
  const showInlineError = loadError !== null && redirects.length > 0;

  const fromPreview = normalizePath(values.fromPath);

  return (
    <section className="flex flex-col gap-4" aria-label="Redirects">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">All redirects</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            A redirect only fires for page paths without a file extension. Static assets and the API
            are never redirected.
          </p>
        </div>
        <Button type="button" className="whitespace-nowrap" onClick={openCreate}>
          <PlusIcon />
          New redirect
        </Button>
      </div>

      {showInlineError ? (
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
            onClick={() => void loadRedirects(true)}
            disabled={isRefreshing}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-border bg-card p-4"
        >
          <span className="sr-only">Loading redirects</span>
          <div className="flex flex-col gap-3">
            {SKELETON_ROWS.map((rowKey) => (
              <Skeleton key={rowKey} className="h-9 w-full" />
            ))}
          </div>
        </div>
      ) : null}

      {showErrorState ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load redirects</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadRedirects(false)}
          >
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <ArrowRightIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No redirects yet</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Add one when you rename a slug or move a page, so the old link keeps working.
            </p>
          </div>
          <Button type="button" onClick={openCreate}>
            <PlusIcon />
            New redirect
          </Button>
        </div>
      ) : null}

      {redirects.length > 0 ? (
        <div
          className={`rounded-xl border border-border bg-card ${isRefreshing ? 'opacity-70' : ''}`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Hits</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {redirects.map((redirect) => (
                <TableRow key={redirect.id}>
                  <TableCell
                    className="max-w-[16rem] truncate font-mono text-xs text-foreground"
                    title={redirect.fromPath}
                  >
                    {redirect.fromPath}
                  </TableCell>
                  <TableCell
                    className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground"
                    title={redirect.toPath}
                  >
                    {redirect.toPath}
                  </TableCell>
                  <TableCell className="tabular-nums text-foreground">
                    {redirect.statusCode}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {redirect.hits.toLocaleString('en-US')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={redirect.isActive ? 'default' : 'outline'}>
                      {redirect.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTimestamp(redirect.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${redirect.fromPath}`}
                        disabled={busyId === redirect.id}
                        onClick={() => openEdit(redirect)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busyId === redirect.id}
                        onClick={() => void handleToggle(redirect)}
                      >
                        {busyId === redirect.id ? <Loader2Icon className="animate-spin" /> : null}
                        {redirect.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${redirect.fromPath}`}
                        disabled={busyId === redirect.id}
                        onClick={() => setPendingDelete(redirect)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit redirect' : 'New redirect'}</DialogTitle>
            <DialogDescription>
              Send one path to another path or a full URL. Redirects only match page paths.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="redirect-from">From path</Label>
              <Input
                id="redirect-from"
                className="font-mono"
                value={values.fromPath}
                autoComplete="off"
                spellCheck={false}
                placeholder="/old-guide"
                aria-invalid={Boolean(fieldErrors.fromPath)}
                aria-describedby={
                  fieldErrors.fromPath ? 'redirect-from-error' : 'redirect-from-help'
                }
                onChange={(event) =>
                  setValues((current) => ({ ...current, fromPath: event.target.value }))
                }
              />
              {fieldErrors.fromPath ? (
                <p id="redirect-from-error" className="text-sm text-destructive">
                  {fieldErrors.fromPath}
                </p>
              ) : values.fromPath.trim().length > 0 ? (
                <p id="redirect-from-help" className="text-xs text-muted-foreground">
                  Saves as <span className="font-mono">{fromPreview}</span>. Paths are lowercased
                  and the trailing slash is removed.
                </p>
              ) : (
                <p id="redirect-from-help" className="text-xs text-muted-foreground">
                  The path to redirect, for example /old-guide. Paths are lowercased and the
                  trailing slash is removed.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="redirect-to">To path or URL</Label>
              <Input
                id="redirect-to"
                className="font-mono"
                value={values.toPath}
                autoComplete="off"
                spellCheck={false}
                placeholder="/new-guide"
                aria-invalid={Boolean(fieldErrors.toPath)}
                aria-describedby={fieldErrors.toPath ? 'redirect-to-error' : 'redirect-to-help'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, toPath: event.target.value }))
                }
              />
              {fieldErrors.toPath ? (
                <p id="redirect-to-error" className="text-sm text-destructive">
                  {fieldErrors.toPath}
                </p>
              ) : (
                <p id="redirect-to-help" className="text-xs text-muted-foreground">
                  Use an absolute path like /new-guide or a full https URL.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="redirect-status">Status code</Label>
              <select
                id="redirect-status"
                className="select-control"
                value={values.statusCode}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    statusCode: Number.parseInt(event.target.value, 10),
                  }))
                }
              >
                {STATUS_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                    {code === 301 ? ' permanent' : null}
                    {code === 302 ? ' temporary' : null}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Use 301 for a permanent move, 302 or 307 for a temporary one.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="redirect-note">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="redirect-note"
                value={values.note}
                maxLength={NOTE_MAX_LENGTH}
                autoComplete="off"
                placeholder="Why this redirect exists"
                aria-invalid={Boolean(fieldErrors.note)}
                aria-describedby={fieldErrors.note ? 'redirect-note-error' : undefined}
                onChange={(event) =>
                  setValues((current) => ({ ...current, note: event.target.value }))
                }
              />
              {fieldErrors.note ? (
                <p id="redirect-note-error" className="text-sm text-destructive">
                  {fieldErrors.note}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <input
                id="redirect-active"
                type="checkbox"
                className="size-4 rounded border-input accent-primary"
                checked={values.isActive}
                onChange={(event) =>
                  setValues((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              <Label htmlFor="redirect-active">Active</Label>
            </div>

            {formError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2Icon className="animate-spin" /> : null}
                {editing ? 'Save changes' : 'Create redirect'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete redirect</DialogTitle>
            <DialogDescription>
              Delete the redirect for{' '}
              <span className="font-mono">{pendingDelete?.fromPath ?? ''}</span>? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
