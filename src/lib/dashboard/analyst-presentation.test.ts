import { describe, expect, it } from 'vitest';
import { ANALYST_FINDING_STATUSES } from '../agents/analyst/findings';
import { ANALYST_RULE_IDS, ANALYST_SOURCE_RULE_IDS } from '../agents/analyst/rules';
import { ANALYST_SOURCES } from '../agents/analyst/sources';
import {
  ANALYST_FINDING_STATUS_FILTERS,
  ANALYST_FINDING_STATUS_LABELS,
  ANALYST_RULE_LABELS,
  ANALYST_SOURCE_LABELS,
  ANALYST_SOURCE_STATE_LABELS,
  buildEvidenceEntries,
  describeAnalystAction,
  describeAnalystEffort,
  describeAnalystRule,
  describeAnalystSource,
  describeAnalystSourceState,
  formatAnalystConfidence,
  formatAnalystSourceList,
  formatEvidenceValue,
  humanizeEvidenceKey,
  resolveAnalystSubject,
} from './analyst-presentation';

describe('analyst labels', () => {
  it('labels every source, rule, status, and source state', () => {
    for (const source of ANALYST_SOURCES) {
      expect(ANALYST_SOURCE_LABELS[source].length).toBeGreaterThan(0);
    }

    for (const ruleId of [...ANALYST_RULE_IDS, ...ANALYST_SOURCE_RULE_IDS]) {
      expect(ANALYST_RULE_LABELS[ruleId].length).toBeGreaterThan(0);
    }

    for (const status of ANALYST_FINDING_STATUSES) {
      expect(ANALYST_FINDING_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }

    for (const state of ['ok', 'missing', 'error', 'unknown'] as const) {
      expect(ANALYST_SOURCE_STATE_LABELS[state].length).toBeGreaterThan(0);
    }
  });

  it('falls back to the stored identifier for a value it does not know', () => {
    expect(describeAnalystRule('unknown_rule')).toBe('unknown_rule');
    expect(describeAnalystSource('unknown_source')).toBe('unknown_source');
    expect(describeAnalystAction('unknown_action')).toBe('unknown_action');
    expect(describeAnalystEffort('XL')).toBe('XL');
    expect(describeAnalystSourceState('weird')).toBe('weird');
  });
});

describe('resolveAnalystSubject', () => {
  it('links a post subject to its editor without printing the raw identifier', () => {
    expect(resolveAnalystSubject('post', 'chair-guide')).toEqual({
      href: '/dashboard/posts/chair-guide/edit',
      linkLabel: 'Open the article editor',
      detail: null,
    });
  });

  it('links a product subject to the catalog and keeps the slug visible', () => {
    expect(resolveAnalystSubject('product', 'desk-lamp')).toEqual({
      href: '/dashboard/monetization/catalog',
      linkLabel: 'Open the product catalog',
      detail: 'desk-lamp',
    });
  });

  it('links a redirect subject to the redirect list with the go path', () => {
    expect(resolveAnalystSubject('redirect', 'desk-lamp')).toEqual({
      href: '/dashboard/redirects',
      linkLabel: 'Open the redirect list',
      detail: '/go/desk-lamp',
    });
  });

  it('escapes a subject identifier before it reaches the url', () => {
    expect(resolveAnalystSubject('post', 'a b/c')?.href).toBe('/dashboard/posts/a%20b%2Fc/edit');
  });

  it('returns nothing for a subject type it does not know', () => {
    expect(resolveAnalystSubject('topic', 'topic-1')).toBeNull();
  });
});

describe('formatAnalystConfidence', () => {
  it('renders a rate as a percentage', () => {
    expect(formatAnalystConfidence(0.95)).toBe('95%');
    expect(formatAnalystConfidence(1)).toBe('100%');
  });

  it('bounds a stored value outside the rate range', () => {
    expect(formatAnalystConfidence(1.4)).toBe('100%');
    expect(formatAnalystConfidence(-0.2)).toBe('0%');
  });
});

describe('humanizeEvidenceKey', () => {
  it('turns a stored key into a readable label', () => {
    expect(humanizeEvidenceKey('baselineViews')).toBe('Baseline views');
    expect(humanizeEvidenceKey('expected_click_rate')).toBe('Expected click rate');
    expect(humanizeEvidenceKey('programStatus')).toBe('Program status');
  });

  it('keeps a key it cannot split', () => {
    expect(humanizeEvidenceKey('')).toBe('');
  });
});

describe('formatEvidenceValue', () => {
  it('formats numbers with grouped digits and leaves strings readable', () => {
    expect(formatEvidenceValue(1234567)).toBe('1,234,567');
    expect(formatEvidenceValue('no_affiliate_link')).toBe('no_affiliate_link');
  });

  it('names an absent value instead of printing null', () => {
    expect(formatEvidenceValue(null)).toBe('Not recorded');
    expect(formatEvidenceValue(undefined)).toBe('Not recorded');
    expect(formatEvidenceValue('')).toBe('Empty');
  });

  it('formats booleans, arrays, and nested objects without raw JSON', () => {
    expect(formatEvidenceValue(true)).toBe('Yes');
    expect(formatEvidenceValue(false)).toBe('No');
    expect(formatEvidenceValue([])).toBe('None');
    expect(formatEvidenceValue(['/post/one', '/post/two'])).toBe('/post/one, /post/two');
    expect(formatEvidenceValue({ views: 20, clickRate: 0.05 })).toBe('Views: 20; Click rate: 0.05');
  });
});

describe('buildEvidenceEntries', () => {
  it('builds a definition list entry per stored key', () => {
    const entries = buildEvidenceEntries({ totalViews: 320, trackingIdPresent: false });

    expect(entries).toEqual([
      { key: 'totalViews', label: 'Total views', value: '320' },
      { key: 'trackingIdPresent', label: 'Tracking id present', value: 'No' },
    ]);
  });
});

describe('formatAnalystSourceList', () => {
  it('joins a source list the way a sentence reads', () => {
    expect(formatAnalystSourceList([])).toBe('');
    expect(formatAnalystSourceList(['GA4'])).toBe('GA4');
    expect(formatAnalystSourceList(['GA4', 'Search Console'])).toBe('GA4 and Search Console');
    expect(formatAnalystSourceList(['GA4', 'Search Console', 'Affiliate network report'])).toBe(
      'GA4, Search Console and Affiliate network report',
    );
  });
});

describe('ANALYST_FINDING_STATUS_FILTERS', () => {
  it('covers every status the engine writes, in the engine order', () => {
    expect(ANALYST_FINDING_STATUS_FILTERS).toEqual([...ANALYST_FINDING_STATUSES]);
  });
});
