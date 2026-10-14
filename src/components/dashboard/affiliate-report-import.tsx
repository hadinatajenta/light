import { FileUpIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { type SubmitEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AffiliateNetwork } from '@/config/monetization';
import { ApiRequestError, requestJson, toErrorMessage, toFieldErrorMap } from './api-client';

const REPORT_ENDPOINT = '/api/dashboard/settings/performance/report';
const CONTENT_MAX_LENGTH = 1_500_000;

const NETWORK_LABELS: Record<AffiliateNetwork, string> = {
  amazon: 'Amazon Associates',
  impact: 'Impact',
  partnerstack: 'PartnerStack',
  shareasale: 'ShareASale',
  direct: 'Direct',
};

const NETWORKS = Object.keys(NETWORK_LABELS) as AffiliateNetwork[];

interface ReportImportResult {
  network: AffiliateNetwork;
  periodStart: string;
  periodEnd: string;
  imported: number;
  unmatched: number;
  skipped: number;
}

interface ApiImportResult {
  imported: number;
  unmatched: number;
  skipped: number;
}

function toRejectedHeaders(error: unknown): string[] {
  if (!(error instanceof ApiRequestError)) {
    return [];
  }

  const headers = (error.details as { headers?: unknown } | undefined)?.headers;

  return Array.isArray(headers)
    ? headers.filter((header): header is string => typeof header === 'string')
    : [];
}

export default function AffiliateReportImport() {
  const [network, setNetwork] = useState<AffiliateNetwork>('amazon');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReportImportResult | null>(null);
  const [rejectedHeaders, setRejectedHeaders] = useState<string[]>([]);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedContent = content.trim();
    const errors: Record<string, string> = {};

    if (periodStart === '') {
      errors.periodStart = 'Set the first day the report covers.';
    }

    if (periodEnd === '') {
      errors.periodEnd = 'Set the last day the report covers.';
    }

    if (periodStart !== '' && periodEnd !== '' && periodStart > periodEnd) {
      errors.periodEnd = 'The period ends before it starts.';
    }

    if (trimmedContent === '') {
      errors.content = 'Paste the report before importing it.';
    }

    setFormError(null);
    setRejectedHeaders([]);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setResult(null);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setResult(null);

    try {
      const payload = await requestJson<ApiImportResult>(REPORT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          network,
          periodStart,
          periodEnd,
          content: trimmedContent,
        }),
      });
      setResult({
        network,
        periodStart,
        periodEnd,
        imported: payload.imported,
        unmatched: payload.unmatched,
        skipped: payload.skipped,
      });
    } catch (error) {
      const mapped = toFieldErrorMap(error);
      setFieldErrors(mapped);

      if (Object.keys(mapped).length === 0) {
        setFormError(toErrorMessage(error));
      }

      setRejectedHeaders(toRejectedHeaders(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="affiliate-report-heading"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <FileUpIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="affiliate-report-heading" className="text-sm font-medium text-foreground">
            Amazon order report
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Amazon does not report orders to this site, so nothing arrives on its own. Open Amazon
            Associates Central, download the order report by hand, and paste the file below. Until a
            report is imported there is no order data here at all, and the analyst cannot see what
            clicked traffic earned.
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-network">Network</Label>
            <Select
              id="report-network"
              className="min-h-11 sm:min-h-9"
              value={network}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.network !== undefined}
              aria-describedby={
                fieldErrors.network ? 'report-network-error' : 'report-network-help'
              }
              onChange={(event) => setNetwork(event.target.value as AffiliateNetwork)}
            >
              {NETWORKS.map((value) => (
                <option key={value} value={value}>
                  {NETWORK_LABELS[value]}
                </option>
              ))}
            </Select>
            <p id="report-network-help" className="text-xs text-muted-foreground">
              The network the file came from. Lines only match products of the same network.
            </p>
            {fieldErrors.network ? (
              <p id="report-network-error" className="text-sm text-destructive">
                {fieldErrors.network}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="report-period-start">Period start</Label>
            <Input
              id="report-period-start"
              type="date"
              className="h-11 sm:h-9"
              value={periodStart}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.periodStart !== undefined}
              aria-describedby={
                fieldErrors.periodStart ? 'report-period-start-error' : 'report-period-help'
              }
              onChange={(event) => setPeriodStart(event.target.value)}
            />
            <p id="report-period-help" className="text-xs text-muted-foreground">
              The first day the file covers.
            </p>
            {fieldErrors.periodStart ? (
              <p id="report-period-start-error" className="text-sm text-destructive">
                {fieldErrors.periodStart}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="report-period-end">Period end</Label>
            <Input
              id="report-period-end"
              type="date"
              className="h-11 sm:h-9"
              value={periodEnd}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.periodEnd !== undefined}
              aria-describedby={
                fieldErrors.periodEnd ? 'report-period-end-error' : 'report-period-end-help'
              }
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
            <p id="report-period-end-help" className="text-xs text-muted-foreground">
              The last day the file covers. The analyst counts coverage from these two dates.
            </p>
            {fieldErrors.periodEnd ? (
              <p id="report-period-end-error" className="text-sm text-destructive">
                {fieldErrors.periodEnd}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="report-content">Report content</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {content.length.toLocaleString('en-US')}/{CONTENT_MAX_LENGTH.toLocaleString('en-US')}
            </span>
          </div>
          <Textarea
            id="report-content"
            rows={8}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            value={content}
            maxLength={CONTENT_MAX_LENGTH}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.content !== undefined}
            aria-describedby={fieldErrors.content ? 'report-content-error' : 'report-content-help'}
            placeholder={
              'Amazon Order ID,Order Date,ASIN,Item Commission,Currency Code,Order Status'
            }
            onChange={(event) => setContent(event.target.value)}
          />
          {fieldErrors.content ? (
            <p id="report-content-error" className="text-sm text-destructive">
              {fieldErrors.content}
            </p>
          ) : (
            <p id="report-content-help" className="text-xs text-muted-foreground">
              Paste the whole file. Comma and tab separated text are both accepted. The file needs
              an order id, an order date, an ASIN, a commission, a currency, and a status column;
              clicks and orders are read when they are present.
            </p>
          )}
        </div>

        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {formError}
              {rejectedHeaders.length > 0 ? (
                <span className="mt-1 block break-all">
                  {`Headers it found: ${rejectedHeaders.join(', ')}.`}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {result ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            <p className="font-medium tabular-nums">
              {result.imported === 0
                ? `No new line was imported for ${NETWORK_LABELS[result.network]} covering ${result.periodStart} to ${result.periodEnd}.`
                : `${result.imported} line(s) imported for ${NETWORK_LABELS[result.network]} covering ${result.periodStart} to ${result.periodEnd}.`}
            </p>
            <p className="tabular-nums">
              {result.unmatched === 0
                ? 'Every imported line matched a product in the catalog.'
                : `${result.unmatched} line(s) are stored without a product link, because the ASIN did not match anything in the catalog. The ledger is append-only, so these lines stay unattributed; add the missing product so a later import matches it.`}
            </p>
            <p className="tabular-nums">
              {result.skipped === 0
                ? 'Nothing was skipped.'
                : `${result.skipped} line(s) were skipped: unreadable rows, or lines that an earlier import had already stored.`}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-11 whitespace-nowrap sm:h-8"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <FileUpIcon aria-hidden="true" />
            )}
            {isSubmitting ? 'Importing' : 'Import report'}
          </Button>
          <span className="max-w-prose text-xs text-muted-foreground">
            A second import of the same period is safe. Identical lines are skipped, and a revised
            amount is stored as an extra line.
          </span>
        </div>
      </form>
    </section>
  );
}
