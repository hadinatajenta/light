import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnalystSourceView } from '@/lib/dashboard/analyst';
import AffiliateReportImport from './affiliate-report-import';
import AnalystSourceList from './analyst-source-list';
import GoogleCredentialBlock from './google-credential-block';

const noop = () => undefined;
const NEVER_CALLED = async () => undefined;

const SOURCES: AnalystSourceView[] = [
  {
    source: 'gsc',
    status: 'missing',
    detail: 'Search Console data is not imported.',
    remediation: 'Add the service account email to the property.',
    rowCount: 0,
    checkedAt: null,
  },
  {
    source: 'clicks',
    status: 'ok',
    detail: 'Read 4 products and 2 click groups.',
    remediation: '',
    rowCount: 4,
    checkedAt: '2026-10-12T10:00:00.000Z',
  },
];

describe('GoogleCredentialBlock', () => {
  it('shows the masked hint and the email instead of the private key', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleCredentialBlock, {
        source: 'gsc',
        description: {
          configured: true,
          hint: 'ab12cd34...ef56',
          clientEmail: 'writer@project.iam.gserviceaccount.com',
          property: 'sc-domain:example.com',
        },
        test: { ok: false, detail: 'Google rejected the service account.' },
        isTestPending: false,
        onTest: noop,
        onSave: NEVER_CALLED,
      }),
    );

    expect(html).toContain('writer@project.iam.gserviceaccount.com');
    expect(html).toContain('sc-domain:example.com');
    expect(html).toContain('ab12cd34...ef56');
    expect(html).toContain('Configured');
    expect(html).toContain('The stored credentials failed.');
    expect(html).not.toContain('PRIVATE KEY');
  });

  it('tells the operator what to do instead of showing an empty success', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleCredentialBlock, {
        source: 'ga4',
        description: { configured: false, hint: null, clientEmail: null, property: null },
        test: null,
        isTestPending: false,
        onTest: noop,
        onSave: NEVER_CALLED,
      }),
    );

    expect(html).toContain('Not configured');
    expect(html).toContain('This source is not connected yet');
    expect(html).toContain('Turn on the Google Analytics Data API');
    expect(html).toContain('Save them first, then test.');
  });
});

describe('AffiliateReportImport', () => {
  it('states that orders have to be downloaded by hand', () => {
    const html = renderToStaticMarkup(createElement(AffiliateReportImport, null));

    expect(html).toContain('Amazon does not report orders to this site');
    expect(html).toContain('there is no order data here at all');
    expect(html).toContain('Amazon Associates');
    expect(html).toContain('Import report');
  });
});

describe('AnalystSourceList', () => {
  it('renders every state with its remediation', () => {
    const html = renderToStaticMarkup(createElement(AnalystSourceList, { sources: SOURCES }));

    expect(html).toContain('Not connected');
    expect(html).toContain('Connected');
    expect(html).toContain('Never checked');
    expect(html).toContain('Next action:');
    expect(html).toContain('Add the service account email to the property.');
  });

  it('renders an empty list as a next step, not as success', () => {
    const html = renderToStaticMarkup(createElement(AnalystSourceList, { sources: [] }));

    expect(html).toContain('Run the Performance Analyst once');
  });
});
