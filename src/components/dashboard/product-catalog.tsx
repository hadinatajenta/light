import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  InboxIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import ProductForm, { type ProductInput, type ProductRecord } from './product-form';
import type { MonetizationReport, ProgramRecord } from './program-manager';
import { mapFieldErrors } from './program-manager';

const PRODUCTS_ENDPOINT = '/api/dashboard/monetization/products';
const PROGRAMS_ENDPOINT = '/api/dashboard/monetization/programs';
const REPORT_ENDPOINT = '/api/dashboard/monetization/report';
const PER_PAGE = 20;
const COLUMN_COUNT = 8;
const IMPORT_MAX_LINES = 200;
const DASH = '-';
const SKELETON_ROWS = [
  'product-skeleton-1',
  'product-skeleton-2',
  'product-skeleton-3',
  'product-skeleton-4',
  'product-skeleton-5',
  'product-skeleton-6',
];

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

const IMPORT_PLACEHOLDER = `anker-737-power-bank | Anker 737 power bank | B0CX23V2ZK
lg-ultrafine-27 | LG UltraFine 27 inch | B08L5VGJ4R`;

type ActiveFilter = 'all' | 'active' | 'inactive';

interface ProductsPayload {
  products: ProductRecord[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface ImportSkip {
  line: number;
  reason: string;
}

interface ImportResult {
  created: number;
  skipped: ImportSkip[];
  errors: ImportSkip[];
}

interface ProductCatalogProps {
  initialQuery: string;
  initialProgram: string;
  initialActive: ActiveFilter;
  initialPage: number;
}

function formatPrice(amount: number | null, currency: string | null): string {
  if (amount === null) {
    return DASH;
  }
  const code = currency ?? 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-US')} ${code}`;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function ProductTableSkeleton() {
  return (
    <>
      {SKELETON_ROWS.map((rowKey) => (
        <TableRow key={rowKey}>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-44" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="size-8" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function LinkState({ affiliateUrl, isActive }: { affiliateUrl: string | null; isActive: boolean }) {
  if (affiliateUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
        <span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
      <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {isActive ? 'Cannot build' : 'Inactive'}
    </span>
  );
}

function ImportSummary({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ImportSkip[];
  tone: 'muted' | 'destructive';
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          'text-xs font-medium tracking-[0.06em] uppercase',
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {title} ({rows.length})
      </p>
      <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
        {rows.map((row) => (
          <li
            key={`${title}-${row.line}`}
            className="flex flex-wrap items-baseline gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"
          >
            <span className="tabular-nums text-muted-foreground">Line {row.line}</span>
            <span className="min-w-0 flex-1 text-foreground">{row.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulkImportDialog({
  isOpen,
  programs,
  onOpenChange,
  onImported,
}: {
  isOpen: boolean;
  programs: ProgramRecord[];
  onOpenChange: (isOpen: boolean) => void;
  onImported: () => void;
}) {
  const [programId, setProgramId] = React.useState('');
  const [text, setText] = React.useState('');
  const [isImporting, setIsImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const programRef = React.useRef<HTMLSelectElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    setProgramId(programs[0]?.id ?? '');
    setText('');
    setResult(null);
    setError(null);
    setFieldErrors({});
    setIsImporting(false);
  }, [isOpen, programs]);

  const lineCount = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

  const handleImport = async () => {
    if (isImporting) {
      return;
    }
    if (!programId) {
      setFieldErrors({ programId: 'Choose the program these products belong to.' });
      programRef.current?.focus();
      return;
    }
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setFieldErrors({ lines: 'Paste at least one line to import.' });
      textRef.current?.focus();
      return;
    }

    if (lines.length > IMPORT_MAX_LINES) {
      setFieldErrors({
        lines: `Import at most ${IMPORT_MAX_LINES} lines at once. You pasted ${lines.length}.`,
      });
      textRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setError(null);
    setResult(null);
    setIsImporting(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = await requestJson<ImportResult>(`${PRODUCTS_ENDPOINT}/import`, {
        method: 'POST',
        body: JSON.stringify({ programId, lines }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setResult(payload);
      if (payload.created > 0 && payload.errors.length === 0) {
        toast.success(
          `Imported ${payload.created} ${payload.created === 1 ? 'product' : 'products'}.`,
        );
      } else if (payload.created > 0) {
        toast.success(
          `Imported ${payload.created} of ${lines.length}, with ${payload.errors.length} ${
            payload.errors.length === 1 ? 'error' : 'errors'
          }.`,
        );
      } else if (payload.errors.length > 0) {
        toast.error(`No products were imported. ${payload.errors.length} lines failed.`);
      } else {
        toast.info('Nothing new was imported. Every line was already in the catalog.');
      }
      if (payload.created > 0) {
        onImported();
      }
    } catch (importError) {
      if (controller.signal.aborted || isAbortError(importError)) {
        return;
      }
      if (importError instanceof ApiRequestError) {
        const mapped = mapFieldErrors(importError.details);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          if (mapped.programId) {
            programRef.current?.focus();
          } else {
            textRef.current?.focus();
          }
        }
      }
      const message = toErrorMessage(importError);
      setError(message);
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsImporting(false);
      }
    }
  };

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!isImporting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Bulk import products
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            One product per line as <span className="font-mono text-xs">slug | name | target</span>.
            A bare ASIN is accepted for Amazon programs.
          </DialogPrimitive.Description>
        </div>

        {programs.length === 0 ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have no programs yet. Create a program first, then import products into it.{' '}
            <a
              href="/dashboard/monetization"
              className="text-foreground underline underline-offset-4"
            >
              Go to programs
            </a>
            .
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="import-program">Program</Label>
          <select
            id="import-program"
            ref={programRef}
            className={SELECT_CLASS}
            value={programId}
            disabled={programs.length === 0}
            aria-invalid={Boolean(fieldErrors.programId)}
            aria-describedby={fieldErrors.programId ? 'import-program-error' : undefined}
            onChange={(event) => setProgramId(event.target.value)}
          >
            <option value="">Select a program</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
          {fieldErrors.programId ? (
            <p id="import-program-error" className="text-sm text-destructive">
              {fieldErrors.programId}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="import-lines">Lines</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {lineCount} {lineCount === 1 ? 'line' : 'lines'}
            </span>
          </div>
          <textarea
            id="import-lines"
            ref={textRef}
            rows={8}
            className={TEXTAREA_CLASS}
            value={text}
            spellCheck={false}
            placeholder={IMPORT_PLACEHOLDER}
            aria-invalid={Boolean(fieldErrors.lines)}
            aria-describedby={fieldErrors.lines ? 'import-lines-error' : 'import-lines-help'}
            onChange={(event) => setText(event.target.value)}
          />
          {fieldErrors.lines ? (
            <p id="import-lines-error" className="text-sm text-destructive">
              {fieldErrors.lines}
            </p>
          ) : (
            <p id="import-lines-help" className="text-xs text-muted-foreground">
              Slugs and names are matched case insensitively. Existing slugs are skipped, not
              overwritten.
            </p>
          )}
        </div>

        {result ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm text-foreground">
              Created <span className="font-medium tabular-nums">{result.created}</span>, skipped{' '}
              <span className="font-medium tabular-nums">{result.skipped.length}</span>, errors{' '}
              <span className="font-medium tabular-nums">{result.errors.length}</span>.
            </p>
            <ImportSummary title="Skipped" rows={result.skipped} tone="muted" />
            <ImportSummary title="Errors" rows={result.errors} tone="destructive" />
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="outline"
              disabled={isImporting}
              className="whitespace-nowrap"
            >
              Close
            </Button>
          </DialogPrimitive.Close>
          <Button
            type="button"
            disabled={isImporting || programs.length === 0}
            className="whitespace-nowrap"
            onClick={() => void handleImport()}
          >
            {isImporting ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            {isImporting ? 'Importing' : 'Import products'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function DeleteProductDialog({
  product,
  isDeleting,
  errorMessage,
  onOpenChange,
  onConfirm,
}: {
  product: ProductRecord | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open={product !== null}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogSurface>
        <div className="flex flex-col gap-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Delete product
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {product
              ? `Delete ${product.name}? Posts that linked to it will stop rendering a link.`
              : 'Confirm the removal of this product.'}
          </DialogPrimitive.Description>
        </div>

        {product && product.referenceCount > 0 ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="tabular-nums">{product.referenceCount}</span>{' '}
            {product.referenceCount === 1 ? 'post references' : 'posts reference'} this product.
            Those links become plain text after deletion.
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
            {isDeleting ? 'Deleting' : 'Delete product'}
          </Button>
        </div>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}

function NeedsAttentionPanel({
  report,
  onOpenImport,
}: {
  report: MonetizationReport;
  onOpenImport: () => void;
}) {
  const { brokenReferences, productsWithoutProgram, inactiveProducts } = report;
  const isEmpty =
    brokenReferences.length === 0 && productsWithoutProgram === 0 && inactiveProducts === 0;

  return (
    <section
      aria-label="Needs attention"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <CircleAlertIcon className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Needs attention</h3>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">
          Nothing is broken. Every reference resolves and every product has a program.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {brokenReferences.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-[0.06em] text-destructive uppercase">
                Broken references ({brokenReferences.length})
              </p>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {brokenReferences.map((reference) => (
                  <li
                    key={`${reference.postId}-${reference.slug}`}
                    className="flex flex-col gap-1 px-3 py-2"
                  >
                    <span className="truncate text-sm text-foreground" title={reference.postTitle}>
                      {reference.postTitle}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Missing product{' '}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                        {reference.slug}
                      </code>
                      <a
                        href={`/dashboard/posts/${encodeURIComponent(reference.postId)}/edit`}
                        className="text-foreground underline underline-offset-4"
                      >
                        Edit post
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {productsWithoutProgram > 0 || inactiveProducts > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {productsWithoutProgram > 0 ? (
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm text-foreground">
                    <span className="font-medium tabular-nums">{productsWithoutProgram}</span>{' '}
                    {productsWithoutProgram === 1 ? 'product has' : 'products have'} no program.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A product needs a program before it can build a link.
                  </p>
                </div>
              ) : null}
              {inactiveProducts > 0 ? (
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm text-foreground">
                    <span className="font-medium tabular-nums">{inactiveProducts}</span>{' '}
                    {inactiveProducts === 1 ? 'product is' : 'products are'} inactive.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inactive products are hidden from posts until you turn them back on.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {brokenReferences.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit whitespace-nowrap"
              onClick={onOpenImport}
            >
              <UploadIcon />
              Bulk import products
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default function ProductCatalog({
  initialQuery,
  initialProgram,
  initialActive,
  initialPage,
}: ProductCatalogProps) {
  const [searchInput, setSearchInput] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery);
  const [programFilter, setProgramFilter] = React.useState(initialProgram);
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>(initialActive);
  const [page, setPage] = React.useState(initialPage);
  const [products, setProducts] = React.useState<ProductRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [programs, setPrograms] = React.useState<ProgramRecord[]>([]);
  const [report, setReport] = React.useState<MonetizationReport | null>(null);
  const [reportStatus, setReportStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<ProductRecord | null>(null);
  const [formProgramsLoading, setFormProgramsLoading] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [productToDelete, setProductToDelete] = React.useState<ProductRecord | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const listAbortRef = React.useRef<AbortController | null>(null);
  const programsAbortRef = React.useRef<AbortController | null>(null);
  const reportAbortRef = React.useRef<AbortController | null>(null);
  const mutationAbortRef = React.useRef<AbortController | null>(null);
  const latestRequestRef = React.useRef(0);

  const loadProducts = React.useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setIsFetching(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();
      if (query) {
        params.set('q', query);
      }
      if (programFilter) {
        params.set('program', programFilter);
      }
      if (activeFilter === 'active') {
        params.set('active', 'true');
      } else if (activeFilter === 'inactive') {
        params.set('active', 'false');
      }
      params.set('page', String(page));
      params.set('per_page', String(PER_PAGE));

      const payload = await requestJson<ProductsPayload>(
        `${PRODUCTS_ENDPOINT}?${params.toString()}`,
        { signal: controller.signal },
      );

      if (latestRequestRef.current !== requestId) {
        return;
      }

      setProducts(payload.products);
      setTotal(payload.total);
      setTotalPages(Math.max(1, payload.total_pages));
      setHasLoaded(true);
      if (payload.page !== page && payload.page >= 1) {
        setPage(payload.page);
      }
    } catch (error) {
      if (latestRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsFetching(false);
      }
    }
  }, [query, programFilter, activeFilter, page]);

  const loadPrograms = React.useCallback(async (showSkeleton: boolean) => {
    programsAbortRef.current?.abort();
    const controller = new AbortController();
    programsAbortRef.current = controller;
    if (showSkeleton) {
      setFormProgramsLoading(true);
    }

    try {
      const payload = await requestJson<{ programs: ProgramRecord[] }>(PROGRAMS_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setPrograms(payload.programs);
    } catch {
      if (!controller.signal.aborted) {
        setPrograms([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setFormProgramsLoading(false);
      }
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
    void loadProducts();
    return () => listAbortRef.current?.abort();
  }, [loadProducts]);

  React.useEffect(() => {
    void loadPrograms(false);
    return () => programsAbortRef.current?.abort();
  }, [loadPrograms]);

  React.useEffect(() => {
    void loadReport();
    return () => reportAbortRef.current?.abort();
  }, [loadReport]);

  React.useEffect(() => {
    return () => mutationAbortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (searchInput.trim() === query) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput, query]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    if (programFilter) {
      params.set('program', programFilter);
    }
    if (activeFilter !== 'all') {
      params.set('active', activeFilter);
    }
    if (page > 1) {
      params.set('page', String(page));
    }
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
  }, [query, programFilter, activeFilter, page]);

  const hasActiveFilters = query !== '' || programFilter !== '' || activeFilter !== 'all';
  const showInitialSkeleton = !hasLoaded && isFetching;
  const showErrorState = loadError !== null && products.length === 0 && !isFetching;
  const showEmpty = hasLoaded && !isFetching && loadError === null && products.length === 0;
  const showRows = !showInitialSkeleton && !showErrorState && !showEmpty;

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = total === 0 ? 0 : (page - 1) * PER_PAGE + products.length;
  const rangeLabel =
    total === 0 ? 'No products' : `Showing ${rangeStart} to ${rangeEnd} of ${total}`;

  const resetFilters = () => {
    setSearchInput('');
    setQuery('');
    setProgramFilter('');
    setActiveFilter('all');
    setPage(1);
  };

  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormOpen(true);
    void loadPrograms(true);
  };

  const openEditDialog = (product: ProductRecord) => {
    setEditingProduct(product);
    setFormOpen(true);
    void loadPrograms(true);
  };

  const handleCopyAffiliateUrl = async (product: ProductRecord) => {
    if (!product.affiliateUrl) {
      toast.error(
        `${product.name} has no link yet. Check its program in the product form to see why.`,
      );
      return;
    }
    const didCopy = await copyText(product.affiliateUrl);
    if (didCopy) {
      toast.success(`Copied the affiliate URL for ${product.name}.`);
    } else {
      toast.error('The URL could not be copied. Copy it from the edit form instead.');
    }
  };

  const handleFormSubmit = async (
    payload: ProductInput,
  ): Promise<Record<string, string> | null> => {
    const targetId = editingProduct?.id ?? null;

    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;

    try {
      await requestJson<{ product: ProductRecord }>(
        targetId ? `${PRODUCTS_ENDPOINT}/${encodeURIComponent(targetId)}` : PRODUCTS_ENDPOINT,
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
      void loadProducts();
      void loadReport();
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

  const handleDelete = async () => {
    const target = productToDelete;
    if (!target || isDeleting) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);

    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${PRODUCTS_ENDPOINT}/${encodeURIComponent(target.id)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setProducts((current) => current.filter((product) => product.id !== target.id));
      setTotal((current) => Math.max(0, current - 1));
      toast.success(`Deleted ${target.name}.`);
      setProductToDelete(null);
      void loadProducts();
      void loadReport();
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Product catalog
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every product maps a program target to a tracked link. Posts link to a product slug and
            the site builds the URL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" className="whitespace-nowrap">
            <a href="/dashboard/monetization">
              Programs
              <ArrowRightIcon />
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap"
            onClick={() => setImportOpen(true)}
          >
            <UploadIcon />
            Bulk import
          </Button>
          <Button type="button" className="whitespace-nowrap" onClick={openCreateDialog}>
            <PlusIcon />
            New product
          </Button>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="catalog-search">Search</Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="catalog-search"
              type="search"
              className="pl-9"
              placeholder="Search by name, slug, or target"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-program">Program</Label>
          <select
            id="catalog-program"
            className={SELECT_CLASS}
            value={programFilter}
            onChange={(event) => {
              setProgramFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All programs</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
            {programFilter && !programs.some((program) => program.id === programFilter) ? (
              <option value={programFilter}>{programFilter}</option>
            ) : null}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-active">Status</Label>
          <select
            id="catalog-active"
            className={SELECT_CLASS}
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as ActiveFilter);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <Button
          type="button"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          disabled={!hasActiveFilters}
          onClick={resetFilters}
        >
          <RotateCcwIcon />
          Reset
        </Button>
      </form>

      {loadError !== null && products.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadProducts()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Program</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="text-right">References</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isFetching && products.length > 0 && 'opacity-60')}>
            {showInitialSkeleton ? <ProductTableSkeleton /> : null}

            {showErrorState ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <TriangleAlertIcon className="size-8 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Could not load the catalog
                      </p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadProducts()}
                    >
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showEmpty ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-40 whitespace-normal">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <InboxIcon className="size-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {hasActiveFilters ? 'No products match your filters' : 'No products yet'}
                      </p>
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                        {hasActiveFilters
                          ? 'Adjust or reset the filters to see more results.'
                          : programs.length === 0
                            ? 'Create a program first, then add products to it.'
                            : 'Add your first product so posts can link to it.'}
                      </p>
                    </div>
                    {hasActiveFilters ? (
                      <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                        Reset filters
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={openCreateDialog}>
                        <PlusIcon />
                        New product
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {showRows
              ? products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {product.slug}
                    </TableCell>
                    <TableCell
                      className="max-w-[18rem] truncate font-medium text-foreground"
                      title={product.name}
                    >
                      {product.name}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                      {product.programName || DASH}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPrice(product.priceAmount, product.priceCurrency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'default' : 'outline'}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <LinkState affiliateUrl={product.affiliateUrl} isActive={product.isActive} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {product.referenceCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${product.name}`}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEditDialog(product)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!product.affiliateUrl}
                            onSelect={() => void handleCopyAffiliateUrl(product)}
                          >
                            <CopyIcon />
                            Copy affiliate URL
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              setDeleteError(null);
                              setProductToDelete(product);
                            }}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      {showRows ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 tabular-nums">
            <span>{rangeLabel}</span>
            {isFetching && hasLoaded ? (
              <span className="flex items-center gap-1 text-xs" aria-live="polite">
                <Loader2Icon className="size-3 animate-spin" />
                Updating
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={isFetching || page <= 1}
            >
              <ChevronLeftIcon />
              Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={isFetching || page >= totalPages}
            >
              Next
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}

      {reportStatus === 'loading' ? (
        <section
          aria-label="Needs attention"
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <span className="sr-only">Loading the catalog report</span>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-64" />
        </section>
      ) : null}

      {reportStatus === 'error' ? (
        <section
          aria-label="Needs attention"
          className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2">
            <PackageIcon className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Needs attention</h3>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            The health report could not be loaded, so broken references and inactive products are
            unknown right now.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadReport()}>
            <RefreshCwIcon />
            Retry
          </Button>
        </section>
      ) : null}

      {reportStatus === 'ready' && report ? (
        <NeedsAttentionPanel report={report} onOpenImport={() => setImportOpen(true)} />
      ) : null}

      <ProductForm
        isOpen={formOpen}
        product={editingProduct}
        programs={programs}
        isLoading={formProgramsLoading}
        loadError={loadError}
        onReload={() => void loadPrograms(true)}
        onOpenChange={(isOpen) => {
          setFormOpen(isOpen);
          if (!isOpen) {
            setEditingProduct(null);
          }
        }}
        onSubmit={handleFormSubmit}
      />

      <BulkImportDialog
        isOpen={importOpen}
        programs={programs}
        onOpenChange={setImportOpen}
        onImported={() => {
          void loadProducts();
          void loadReport();
        }}
      />

      <DeleteProductDialog
        product={productToDelete}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setProductToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
