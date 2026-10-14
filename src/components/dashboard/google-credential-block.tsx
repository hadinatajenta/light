import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  AnalystGoogleSource,
  GoogleCredentialDescription,
} from '@/lib/agents/analyst/credentials';
import type { AnalystCredentialTestResult } from '@/lib/agents/analyst/sources';
import { ApiRequestError, toErrorMessage, toFieldErrorMap } from './api-client';

const CONTROL_CLASS = 'h-11 sm:h-9';
const GOOGLE_CLOUD_PROJECT_URL = 'https://console.cloud.google.com/projectcreate';
const GOOGLE_CLOUD_SERVICE_ACCOUNTS_URL =
  'https://console.cloud.google.com/iam-admin/serviceaccounts/create';

const SERVICE_ACCOUNT_ERROR_FIELDS = new Set([
  'serviceAccount',
  'type',
  'client_email',
  'private_key',
  'project_id',
]);

const PROPERTY_ERROR_FIELDS = new Set(['property', 'propertyId']);

interface GuideStep {
  text: string;
  link: { href: string; label: string } | null;
}

interface GoogleCredentialGuide {
  heading: string;
  summary: string;
  serviceAccountLabel: string;
  serviceAccountHelp: string;
  propertyField: 'property' | 'propertyId';
  propertyLabel: string;
  propertyPlaceholder: string;
  propertyHelp: string;
  missingNote: string;
  steps: GuideStep[];
}

const GUIDES: Record<AnalystGoogleSource, GoogleCredentialGuide> = {
  gsc: {
    heading: 'Search Console',
    summary:
      'The analyst reads impressions, clicks, and average position per page from this property, which is what the title, meta, and refresh rules need.',
    serviceAccountLabel: 'Service account JSON',
    serviceAccountHelp:
      'Open the downloaded key file and paste the whole content here. The key is stored encrypted, and the private key is never shown again.',
    propertyField: 'property',
    propertyLabel: 'Property',
    propertyPlaceholder: 'https://example.com/ or sc-domain:example.com',
    propertyHelp:
      'Write the property exactly as Search Console names it: an https:// address for a URL-prefix property, or sc-domain:example.com for a domain property.',
    missingNote:
      'This source is not connected yet. Until the service account and the property are saved, the analyst reads nothing here and the rules that need Search Console stay dormant.',
    steps: [
      {
        text: 'Create a Google Cloud project, or pick an existing one.',
        link: { href: GOOGLE_CLOUD_PROJECT_URL, label: 'Open the project page' },
      },
      {
        text: 'Turn on the Search Console API in that project.',
        link: {
          href: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com',
          label: 'Open the Search Console API',
        },
      },
      {
        text: 'Create a service account. It needs no project role and no user access; you only need the email address it gets.',
        link: { href: GOOGLE_CLOUD_SERVICE_ACCOUNTS_URL, label: 'Open service accounts' },
      },
      {
        text: 'Open the service account, open Keys, add a key, and choose JSON. The browser downloads the key file once and it cannot be downloaded again.',
        link: null,
      },
      {
        text: 'Paste the whole downloaded JSON into the box below and save.',
        link: null,
      },
      {
        text: 'Copy the service account email that appears above and add it in Search Console under Settings, Users and permissions, with full or restricted access to your property.',
        link: { href: 'https://search.google.com/search-console', label: 'Open Search Console' },
      },
      {
        text: 'Set the property below to the same property you granted access to.',
        link: null,
      },
    ],
  },
  ga4: {
    heading: 'GA4',
    summary:
      'The analyst reads sessions and page views per page path from this property. GA4 has no impressions, click-through rate, or position, and the analyst never claims them.',
    serviceAccountLabel: 'Service account JSON',
    serviceAccountHelp:
      'Open the downloaded key file and paste the whole content here. The key is stored encrypted, and the private key is never shown again.',
    propertyField: 'propertyId',
    propertyLabel: 'Property id',
    propertyPlaceholder: '123456789',
    propertyHelp:
      'The numeric property id, not the measurement id. In Google Analytics it is under Admin, Property settings, and it does not start with G-.',
    missingNote:
      'This source is not connected yet. Until the service account and the property id are saved, the analyst reads nothing here and the GA4 cross-check stays silent.',
    steps: [
      {
        text: 'Create a Google Cloud project, or reuse the one you made for Search Console.',
        link: { href: GOOGLE_CLOUD_PROJECT_URL, label: 'Open the project page' },
      },
      {
        text: 'Turn on the Google Analytics Data API in that project.',
        link: {
          href: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com',
          label: 'Open the Analytics Data API',
        },
      },
      {
        text: 'Create a service account. It needs no project role and no user access; you only need the email address it gets.',
        link: { href: GOOGLE_CLOUD_SERVICE_ACCOUNTS_URL, label: 'Open service accounts' },
      },
      {
        text: 'Open the service account, open Keys, add a key, and choose JSON. The browser downloads the key file once and it cannot be downloaded again.',
        link: null,
      },
      {
        text: 'Paste the whole downloaded JSON into the box below and save.',
        link: null,
      },
      {
        text: 'Copy the service account email that appears above and add it in Google Analytics under Admin, Property access management, as a Viewer on the property.',
        link: { href: 'https://analytics.google.com/', label: 'Open Google Analytics' },
      },
      {
        text: 'Set the numeric property id below.',
        link: null,
      },
    ],
  },
};

function toCredentialFieldErrors(error: unknown, propertyField: string): Record<string, string> {
  const mapped: Record<string, string> = {};

  for (const [field, message] of Object.entries(toFieldErrorMap(error))) {
    if (SERVICE_ACCOUNT_ERROR_FIELDS.has(field)) {
      mapped.serviceAccount = message;
    } else if (PROPERTY_ERROR_FIELDS.has(field)) {
      mapped[propertyField] = message;
    }
  }

  if (Object.keys(mapped).length > 0) {
    return mapped;
  }

  if (error instanceof ApiRequestError) {
    const field = (error.details as { field?: unknown } | undefined)?.field;

    if (typeof field === 'string' && SERVICE_ACCOUNT_ERROR_FIELDS.has(field)) {
      return { serviceAccount: error.message };
    }

    if (typeof field === 'string' && PROPERTY_ERROR_FIELDS.has(field)) {
      return { [propertyField]: error.message };
    }
  }

  return {};
}

interface GoogleCredentialBlockProps {
  source: AnalystGoogleSource;
  description: GoogleCredentialDescription;
  test: AnalystCredentialTestResult | null;
  isTestPending: boolean;
  onTest: () => void;
  onSave: (source: AnalystGoogleSource, body: Record<string, string>) => Promise<void>;
}

export default function GoogleCredentialBlock({
  source,
  description,
  test,
  isTestPending,
  onTest,
  onSave,
}: GoogleCredentialBlockProps) {
  const guide = GUIDES[source];
  const storedProperty = description.property ?? '';
  const [serviceAccount, setServiceAccount] = useState('');
  const [property, setProperty] = useState(storedProperty);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const [areStepsOpen, setAreStepsOpen] = useState(!description.configured);

  useEffect(() => {
    setProperty(storedProperty);
  }, [storedProperty]);

  const serviceAccountId = `${source}-service-account`;
  const propertyId = `${source}-${guide.propertyField}`;
  const serviceAccountError = fieldErrors.serviceAccount;
  const propertyError = fieldErrors[guide.propertyField];

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const trimmedKey = serviceAccount.trim();
    const trimmedProperty = property.trim();
    const body: Record<string, string> = {};

    if (trimmedKey !== '') {
      body.serviceAccount = trimmedKey;
    }

    if (trimmedProperty !== storedProperty) {
      body[guide.propertyField] = trimmedProperty;
    }

    setNotice(null);

    if (Object.keys(body).length === 0) {
      setFieldErrors({});
      setSaveError(
        storedProperty === ''
          ? 'Paste the service account JSON and set the property before saving.'
          : 'Nothing changed. Paste a service account JSON to replace the stored key, or edit the property.',
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setFieldErrors({});

    try {
      await onSave(source, body);
      setServiceAccount('');
      setIsConfirmingRemoval(false);
      setNotice(`${guide.heading} credentials saved.`);
    } catch (error) {
      const errors = toCredentialFieldErrors(error, guide.propertyField);
      setFieldErrors(errors);

      if (Object.keys(errors).length === 0) {
        setSaveError(toErrorMessage(error));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoval = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setFieldErrors({});
    setNotice(null);

    try {
      await onSave(source, { serviceAccount: '', [guide.propertyField]: '' });
      setServiceAccount('');
      setIsConfirmingRemoval(false);
      setNotice(`${guide.heading} credentials removed. The analyst no longer reads this source.`);
    } catch (error) {
      setSaveError(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const copyServiceAccountEmail = async () => {
    const email = description.clientEmail;

    if (!email) {
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      setCopyNotice('Service account email copied.');
    } catch {
      setCopyNotice('Copying failed. Select the address and copy it by hand.');
    }
  };

  return (
    <section
      aria-labelledby={`${source}-credentials-heading`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <KeyRoundIcon
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3
              id={`${source}-credentials-heading`}
              className="text-sm font-medium text-foreground"
            >
              {guide.heading}
            </h3>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{guide.summary}</p>
          </div>
        </div>
        <Badge variant={description.configured ? 'default' : 'secondary'}>
          {description.configured ? 'Configured' : 'Not configured'}
        </Badge>
      </div>

      {description.configured ? (
        <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
              Service account email
            </dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {description.clientEmail}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={CONTROL_CLASS}
                aria-label="Copy the service account email"
                onClick={() => void copyServiceAccountEmail()}
              >
                <CopyIcon aria-hidden="true" />
                Copy email
              </Button>
              <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {copyNotice}
              </span>
            </dd>
            <p className="text-xs text-muted-foreground">
              Grant this address access on the property. Analysis fails until it is a reader there.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
              {guide.propertyLabel}
            </dt>
            <dd className="break-all text-sm text-foreground">{description.property}</dd>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
              Stored key
            </dt>
            <dd className="break-all font-mono text-xs text-muted-foreground">
              {description.hint}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="max-w-prose rounded-md border border-chart-3/50 bg-chart-3/10 px-3 py-2 text-sm text-foreground">
          {guide.missingNote}
        </p>
      )}

      <details
        className="rounded-lg border border-border p-3"
        open={areStepsOpen}
        onToggle={(event) => setAreStepsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          {`How to get these credentials (${guide.steps.length} steps)`}
        </summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          {guide.steps.map((step) => (
            <li key={step.text} className="max-w-prose">
              {step.text}
              {step.link ? (
                <>
                  {' '}
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-4"
                  >
                    {step.link.label}
                  </a>
                  .
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </details>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={serviceAccountId}>{guide.serviceAccountLabel}</Label>
          <Textarea
            id={serviceAccountId}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            value={serviceAccount}
            disabled={isSaving}
            aria-invalid={serviceAccountError !== undefined}
            aria-describedby={
              serviceAccountError ? `${serviceAccountId}-error` : `${serviceAccountId}-help`
            }
            placeholder={'{\n  "type": "service_account",\n  ...\n}'}
            onChange={(event) => setServiceAccount(event.target.value)}
          />
          {serviceAccountError ? (
            <p id={`${serviceAccountId}-error`} className="text-sm text-destructive">
              {serviceAccountError}
            </p>
          ) : (
            <p id={`${serviceAccountId}-help`} className="text-xs text-muted-foreground">
              {description.configured
                ? 'Leave this empty to keep the stored key.'
                : guide.serviceAccountHelp}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={propertyId}>{guide.propertyLabel}</Label>
          <Input
            id={propertyId}
            className={`font-mono ${CONTROL_CLASS}`}
            value={property}
            disabled={isSaving}
            spellCheck={false}
            autoComplete="off"
            placeholder={guide.propertyPlaceholder}
            aria-invalid={propertyError !== undefined}
            aria-describedby={propertyError ? `${propertyId}-error` : `${propertyId}-help`}
            onChange={(event) => setProperty(event.target.value)}
          />
          {propertyError ? (
            <p id={`${propertyId}-error`} className="text-sm text-destructive">
              {propertyError}
            </p>
          ) : (
            <p id={`${propertyId}-help`} className="text-xs text-muted-foreground">
              {guide.propertyHelp}
              {description.configured ? ' Clearing the field removes the stored property.' : ''}
            </p>
          )}
        </div>

        {saveError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {saveError}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-11 whitespace-nowrap sm:h-8"
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRoundIcon aria-hidden="true" />
            )}
            {isSaving ? 'Saving' : 'Save credentials'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 whitespace-nowrap sm:h-8"
            disabled={isSaving || isTestPending || !description.configured}
            onClick={onTest}
          >
            {isTestPending ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2Icon aria-hidden="true" />
            )}
            {isTestPending ? 'Testing' : 'Test connection'}
          </Button>
          {description.configured ? (
            isConfirmingRemoval ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-11 whitespace-nowrap sm:h-8"
                  disabled={isSaving}
                  onClick={() => void handleRemoval()}
                >
                  Confirm removal
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 whitespace-nowrap sm:h-8"
                  disabled={isSaving}
                  onClick={() => setIsConfirmingRemoval(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 whitespace-nowrap sm:h-8"
                disabled={isSaving}
                onClick={() => {
                  setNotice(null);
                  setSaveError(null);
                  setIsConfirmingRemoval(true);
                }}
              >
                Remove stored credentials
              </Button>
            )
          ) : null}
        </div>

        <p className="max-w-prose text-xs text-muted-foreground">
          {description.configured
            ? 'The connection test reads the stored credentials, so save your changes before testing.'
            : 'The connection test needs saved credentials. Save them first, then test.'}
        </p>

        {test ? (
          <p
            role="status"
            aria-live="polite"
            className={
              test.ok
                ? 'flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground'
                : 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            }
          >
            {test.ok ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              <span className="font-medium">
                {test.ok ? 'The stored credentials worked. ' : 'The stored credentials failed. '}
              </span>
              {test.detail}
            </span>
          </p>
        ) : null}
      </form>
    </section>
  );
}
